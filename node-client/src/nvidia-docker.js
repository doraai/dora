'use strict'

let Pipe = require('Piperunner').Pipe
let Runner = require('Piperunner').Runner
let shell = require('shelljs')
let shellescape = require('shell-escape')
let randomstring = require('randomstring')
let fs = require('fs')
let Docker = require('dockerode')
let docker = new Docker({socketPath: '/var/run/docker.sock'})

let socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock'
let stats  = fs.statSync(socket)

if (!stats.isSocket()) {
  throw new Error('Are you sure the docker is running?')
}

function getContainerByName(name) {
    // filter by name
    var opts = {
      "limit": 1,
      "filters": `{"name": ["${name}"]}`
    }

    return new Promise((resolve, reject)=>{
      docker.listContainers(opts, function(err, containers) {
        if(err) {
          reject(err)
        } else{
          resolve(containers && containers[0])
        }
      });
    })
}

async function getContainer (pipe, job) {
	let container = docker.getContainer(job.id)
	if (container) {
		container.inspect(function (err, data) {
			if (err) {
		  		pipe.data.inspect = 'error'
		  		pipe.data.info = data
		  		pipe.next()				
			} else {
				pipe.data.inspect = 'done'
		  		pipe.data.info = data
		  		pipe.next()			
			}
		})
		
	} else {
		pipe.data.inspect = 'notpresent'
		pipe.next()
	}
}

async function getContainerBatch (pipe, job) {
	let container = docker.getContainer(job.id)
	if (container) {
		container.inspect(function (err, data) {
			if (err) {
				pipe.data[job.name] = {
					name: job.name,
					inspect: 'error',
					info: data
				}
		
			} else {
				pipe.data[job.name] = {
					name: job.name,
					inspect: 'done',
					info: data
				}
			}
			pipe.next()			
		})
	} else {
		pipe.data[job.name] = {
			name: job.name,
			inspect: 'notpresent',
		}
		pipe.next()
	}
}

let Pulls = {}

async function pull (pipe, job) {
	console.log('Pulling')
	let image = job.registry == undefined ? job.image : job.registry + '/' + job.image

	if (Pulls[job.pullUid] == undefined) { // TODO generate random ID
		console.log('creating pull for', image)
		Pulls[job.pullUid] = {date: new Date(), status: 'start'}
	}
	console.log('--->', Pulls[image])
	docker.pull(image, async function (err, stream) {
		if (err) {
			console.log('pull err', err)
			pipe.data.pulled = false
			pipe.data.pullError = true
			pipe.data.pullError = err
			Pulls[job.pullUid] = {date: new Date(), status: 'error', data: pullError}
			pipe.end()
		} else {
			let result = await new Promise((resolve, reject) => {
			  docker.modem.followProgress(stream, (err, res) => {
			  	console.log(err, res)
			  	err ? reject(err) : resolve(res)
			  })
			})
			pipe.data.pulled = true
			pipe.data.pullResult = result
			Pulls[job.pullUid] = {date: new Date(), status: 'done', data: result}
			pipe.end()
		}
	})
}

async function remove (pipe, job) {
	shell.exec('docker stop ' + job.name)
	shell.exec('docker rm ' + job.name)
	pipe.next()
}

async function create (pipe, job) {
	let previusContainer = await getContainerByName(job.name)
	if (previusContainer) {
		let pC = docker.getContainer(previusContainer.Id)
		pC.remove(function (err, data) {
  			let image = job.registry == undefined ? job.image : job.registry + '/' + job.image
			docker.createContainer({Tty: true, Image: image, name: job.name}, function (err, container) {
				if (err) {
					pipe.data.createError = true
					pipe.data.createErrorSpec = err
					pipe.end()
				} else {
					pipe.data.created = true
					pipe.data.container = container
					pipe.next(container)
				}
			})

		})
	} else {
		console.log('NO PV')
		let image = job.registry == undefined ? job.image : job.registry + '/' + job.image
		docker.createContainer({Tty: true, Image: image, name: job.name}, function (err, container) {
			if (err) {
				pipe.data.createError = true
				pipe.data.createErrorSpec = err
				pipe.end()
			} else {
				pipe.data.created = true
				pipe.data.container = container
				pipe.next(container)
			}
		})
	}
}

async function createVolume (pipe, job) {
	pipe.data.volume = {}
	pipe.data.volume.errors = []
	console.log('job.volume', job.volume)
	if (job.volume == undefined) {
		pipe.next()
		return
	}

	let cmd = ''
	let rootPathCmd = ''
	let data = {}
	for (var i = 0; i < job.volume.length; i += 1) {
		let vol = job.volume[i]
		let type = vol.kind
		if (type == 'nfs') {
			data = {
				name: vol.name,
				server: vol.storage._p.spec.nfs.server,
				rootPath: vol.storage._p.spec.nfs.path,
				subPath: vol.vol._p.spec.subPath
			}
			cmd = `docker volume create --driver local --opt type=nfs --opt o=addr=${data.server},rw --opt device=:${data.rootPath}${data.subPath} ${data.name}`
			rootPathCmd = `docker volume create --driver local --opt type=nfs --opt o=addr=${data.server},rw --opt device=:${data.rootPath} ${data.name + '-root'}`
			let output = shell.exec(cmd)
			if (output.code != 0) {
				pipe.data.volume.errors.push('error creating nfs volume')
			}
			if (data.subPath !== undefined) {
				let outputRoot = shell.exec(rootPathCmd)
				if (outputRoot.code != 0) {
					pipe.data.volume.errors.push('error creating nfs root volume')
				}
				let busyboxName = randomstring.generate(24).toLowerCase()
				let out = shell.exec(`docker run -d --mount 'source=${data.name + '-root'},target=/mnt' --name ${busyboxName}  busybox /bin/mkdir -p /mnt${data.subPath}`)
				if (out.code != 0) {
					pipe.data.volume.errors.push('error creating nfs subpath volume')
				}
    			shell.exec(`docker stop ${busyboxName}`)
    			shell.exec(`docker rm ${busyboxName}`)
			} 
		} else {
			data = {
				name: vol.name
			}
			cmd = `docker volume create ${data.name}`
			let output = shell.exec(cmd)
			if (output.code != 0) {
				pipe.data.volume.errors.push('error creating volume')
			}
		}		
	}
	console.log('pipe.data.volume', pipe.data.volume)
	pipe.next()
}

async function start (pipe, job) {
	if (pipe.data.volume.errors.length !== 0) {
		console.log('Exiting becuse volume err')
		pipe.data.started = false
		pipe.data.container = {}
		pipe.next()
		return
	}
	let image = job.registry == undefined ? job.image : job.registry + '/' + job.image
	let output = ''
	let startMode = (job.config !== undefined && job.config.startMode !== undefined) ? job.config.startMode : '-itd'
	let cmd = (job.config !== undefined && job.config.cmd !== undefined) ? job.config.cmd : ''
	//let cpus = (job.config !== undefined && job.config.cpus !== undefined) ? job.config.cpus : '1'
	//let memory = (job.config !== undefined && job.config.memory !== undefined) ? job.config.memory : '512m'
	let volume = (job.volume !== undefined) ? job.volume : null
	let shellCommand = ''

	let calcGpus = function (gpuAry) {
		let gpus = ''
		gpuAry.forEach((gpu) => {
			gpus += gpu.minor_number + ','
		})
		gpus = gpus.slice(0, -1)
		return gpus
	}

	if (job.gpu == undefined || process.env.mode == 'dummy') {
		//  '--cpus=' + cpus
		shellCommand = ['docker', 'run', '--name', job.name]
		if (volume !== null) {
			volume.forEach((vol) => {
				shellCommand.push('--mount')
				shellCommand.push('source=' + vol.name + ',target=' + vol.target)
			})
		}
		shellCommand = shellCommand.concat([startMode, image, cmd])
	} else { //
		let GPU__RES = calcGpus(job.gpu) // '--cpus=' + cpus
		shellCommand = ['docker', 'run', '--name', job.name, '--gpus', '"device=' + GPU__RES +'"']
		if (volume !== null) {
			volume.forEach((vol) => {
				shellCommand.push('--mount')
				shellCommand.push('source=' + vol.name + ',target=' + vol.target)
			})
		}
		shellCommand = shellCommand.concat([startMode, image, cmd])
	}

	console.log('Cmd start:', shellescape(shellCommand))
	output = shell.exec(shellescape(shellCommand))
	console.log('->', output)
	pipe.data.started = true
	pipe.data.container = {}
	pipe.data.container.id = output.trim()
	pipe.next()	

	//docker.run(image, [], process.stdout, {}, {'-d', '--gpus': "'device=" + job.gpu.minor_number + "'"}, function (err, data, container) {
	//	if (err) {
	//		pipe.data.started = false
	//		pipe.data.startError = true
	//		pipe.data.startErrorSpec = err
	//		pipe.end()
	//	} else {
	//		pipe.data.started = true
	//		pipe.data.container = container		
	//		pipe.next()	
	//	}
	//})
	//pipe.data.container.start(function (err) {
	//	if (err) {
	//		pipe.data.startError = true
	//		pipe.data.startErrorSpec = err
	//		pipe.end()
	//	} else {
	//		pipe.data.started = true
	//		pipe.next()
	//	}
	//})
}

async function stop (pipe, job) {
	let container = docker.getContainer(job.id)
	if (container) {
		container.stop(function (err) {
			if (err) {
				pipe.data.stopError = true
				pipe.data.stopErrorSpec = err
				pipe.next()
			} else {
				pipe.data.stop = true
				pipe.next()
			}
		})
	}
}

async function deleteContainer (pipe, job) {
	let container = docker.getContainer(job.id)
	if (container) {
		container.remove(function (err, data) {
			if (err) {
		  		pipe.data.remove = 'error'
		  		pipe.data.info = data
		  		console.log(err)
		  		pipe.next()				
			} else {
				pipe.data.remove = 'done'
		  		pipe.data.info = data
		  		pipe.next()			
			}
		})		
	} else {
		pipe.data.remove = 'notpresent'
		pipe.end()
	}
}

async function logsContainer (pipe, job) {
	let container = docker.getContainer(job.id)
	if (container) {
		pipe.data.logs = await container.logs({stdout: true, stderr: true})
		pipe.next()
	} else {
		pipe.end()
	}
}

module.exports.logs = (body, cb) => {
	let pipe = new Pipe()
	pipe.step('logs', (pipe, job) => {
		logsContainer(pipe, job)
	})
	pipe._pipeEndCallback = () => {
		cb(pipe.data)
	}
	pipe.setJob(body)
	pipe.run()
}

module.exports.pull = (body, cb) => {
	let pipe = new Pipe()
	pipe.step('pull', (pipe, job) => {
		pull(pipe, job)
	})
	pipe._pipeEndCallback = () => {
		cb(pipe.data)
	}
	pipe.setJob(body)
	pipe.run()
}

module.exports.pullStatus = (body, cb) => {
	cb(Pulls[body.pullUid])
}

module.exports.batchPullStatus = (body, cb) => {
	let results = {}
	body.forEach((workload) => {
		results[workload.name] = {}
		results[workload.name] = Pulls[workload.pullUid]
		results[workload.name].name = workload.name
	})
	console.log('PULLSTATUS', results)
	cb(results)
}

module.exports.launch = (body, cb) => {
	let pipe = new Pipe()

	pipe.step('remove', (pipe, job) => {
		remove(pipe, job)
	})
	pipe.step('createVolume', (pipe, job) => {
		createVolume(pipe, job)
	})
	pipe.step('start', (pipe, job) => {
		start(pipe, job)
	})
	pipe._pipeEndCallback = () => {
		cb(pipe.data)
	}
	pipe.setJob(body)
	pipe.run()
}

module.exports.status = (body, cb) => {
	let pipe = new Pipe()
	pipe.step('getcontainer', (pipe, job) => {
		getContainer(pipe, job)
	})
	pipe._pipeEndCallback = () => {
		cb(pipe.data)
	}
	pipe.setJob(body)
	pipe.run()
}

module.exports.batchStatus = (body, cb) => {
	let pipe = new Pipe()
	pipe.data = {}
	pipe.step('getcontainer', (pipe, job) => {
		getContainerBatch(pipe, job)
	})
	let runner = new Runner(body, pipe, () => {
		cb(pipe.data)
	})
}

module.exports.delete = (body, cb) => {
	let pipe = new Pipe()
	pipe.step('stopcontainer', (pipe, job) => {
		stop(pipe, job)
	})
	pipe.step('deletecontainer', (pipe, job) => {
		deleteContainer(pipe, job)
	})
	pipe._pipeEndCallback = () => {
		cb(pipe.data)
	}
	pipe.setJob(body)
	pipe.run()
}

module.exports.createVolume = (body, cb) => {
	let pipe = new Pipe()
	pipe.step('createVolume', (pipe, job) => {
		createVolume(pipe, job)
	})
	pipe._pipeEndCallback = () => {
		cb(pipe.data)
	}
	pipe.setJob(body)
	pipe.run()
	//let output = shell.exec('docker volume create ' + body.name)
	//console.log('--->', output)
	//if (output.stderr == '') {
	//	cb(true)	
	//} else {
	//	cb(false)
	//}
}

module.exports.deleteVolume = (body, cb) => {
	let output = shell.exec('docker volume remove ' + body.name)
	console.log('--->', output)
	if (output.stderr == '') {
		cb(true)	
	} else {
		cb(false)
	}
}