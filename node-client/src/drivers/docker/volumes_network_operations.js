'use strict'

let fs = require('fs')
let Docker = require('dockerode')
let DockerEvents = require('docker-events')
let httpProxy = require('http-proxy')
let dockerDriver = require('./driver')

let socket = process.env.DOCKER_SOCKET || '/var/run/docker.sock'
let stats  = fs.statSync(socket)

if (!stats.isSocket()) {
  throw new Error('Docker is not running on this socket:', socket)
}

let SYNC_MAP = {}

let docker = new Docker({socketPath: socket})

let dockerEmitter = new DockerEvents({
  docker: docker,
})
dockerEmitter.start()

dockerEmitter.on('start', async function (message) {
	let containerName = message.Actor.Attributes.name
	console.log(containerName, 'start')
	setSyncInMap(containerName, 'ready', true)
})

dockerEmitter.on('stop', async function (message) {
	let containerName = message.Actor.Attributes.name
	console.log(containerName, 'socketPath')
	setSyncInMap(containerName, 'died', true)
})

dockerEmitter.on('die', async function (message) {
	let containerName = message.Actor.Attributes.name
	console.log(containerName, 'died')
  	setSyncInMap(containerName, 'died', true)
})

function setSyncMapDefault (syncName) {
	SYNC_MAP[syncName] = {
		proxy: null,
		ready: false,
		died: false,
		storageData: null,
		port: null,
		proxyAddress: null,
		proxyIP: null,
	}
} 

function getSyncInMap (syncName) {
	return SYNC_MAP[syncName]
} 

function setSyncInMap (syncName, key, value) {
	if (SYNC_MAP[syncName] == undefined) {
		return
	}
	SYNC_MAP[syncName][key] = value
} 

function createSyncProxy (onErr) {
	let proxy = httpProxy.createProxyServer({secure: false})
	proxy.on('error', function (err, req, res) {
		onErr(err, req, res)
	})
	return proxy
}

function checkRunningSync (syncName, cb) {
	dockerDriver.getRunningContainerByName(syncName, (err, responseContainer) => {
		cb(err, responseContainer)
	})
}

function inspectRunningSync (syncName, responseContainer, cb) {
	let syncContainer = getSyncInMap(syncName)
	responseContainer.inspect(function (err, data) {
		if (err) {
			cb(err)
		} else {
			cb(null, data)
		}
	})
}

function createSyncContainer (syncName, cb) {
	let syncContainer = getSyncInMap(syncName)
	dockerDriver.createSyncContainer(syncContainer.storageData, (err, responseContainer) => {
		responseContainer.inspect(function (err, data) {
			cb(err, data)
		})
	})	
}

function proxySyncContainer (op, syncName, req, res) {
	let syncContainer = getSyncInMap(syncName)
	
	switch (op) {
		case 'upload':
			let urlUpload = `${'http://' + syncContainer.proxyIP + ':' + syncContainer.port}/${'v1.experimental'}/${req.params.group}/Volume/${op}/${req.params.volumeName}/-/${encodeURIComponent(req.params.uploadId)}/${req.params.storage}/${req.params.tus}`
			syncContainer.proxy.web(req, res, {target: urlUpload, ignorePath: true} )
			break
		case 'ls':
			let urlLs = `${'http://' + syncContainer.proxyIP + ':' + syncContainer.port}`
			syncContainer.proxy.web(req, res, {target: urlLs} )
			break
	}
}


module.exports.operation = (op, req, res) => {
	try {
		let syncContainerName = `pwmsync.${req.params.group}.${req.params.volumeName}` 
		let storageData = JSON.parse(req.params.storage)
		storageData.id = syncContainerName

		let proxyAddress = 'http://' + storageData.nodeAddress + ':' 
		let proxyIP = storageData.nodeAddress
		if (getSyncInMap(syncContainerName) == undefined || getSyncInMap(syncContainerName).died == true) {
			console.log('Empty sync map, checking...')
			// Check if this node has been restarted and then there is sync, or
			// if it is the first time for this sync
			checkRunningSync(syncContainerName, (err, container) => {
				if (err) {
					console.log('Create NEW')
					// Create sync from scratch
					setSyncMapDefault(syncContainerName)
					setSyncInMap(syncContainerName, 'storageData', storageData)
					setSyncInMap(syncContainerName, 'proxyAddress', proxyAddress)
					setSyncInMap(syncContainerName, 'proxyIP', proxyIP)
					createSyncContainer(syncContainerName, (err, data) => {
						if (err) {
							console.log('Really bad 1')
						} else {
							let port = data.NetworkSettings.Ports['3002/tcp'][0].HostPort
							let proxy = createSyncProxy((err, req, res) => {
								res.sendStatus(425)
							})
							setSyncInMap(syncContainerName, 'port', port)
							setSyncInMap(syncContainerName, 'proxy', proxy)
							// Wait the container server service be alive
							setTimeout(() => {
								proxySyncContainer(op, syncContainerName, req, res)	
							}, 2000)
						}
					})
				} else {
					inspectRunningSync(syncContainerName, container, (err, data) => {
						if (err) {
							console.log('Really bad 2')
						} else {
							console.log('Recreate Only proxy')
							// Create only the proxy, the sync is alredy here
							setSyncMapDefault(syncContainerName)
							setSyncInMap(syncContainerName, 'proxyAddress', proxyAddress)
							setSyncInMap(syncContainerName, 'storageData', storageData)
							setSyncInMap(syncContainerName, 'proxyAddress', proxyAddress)
							setSyncInMap(syncContainerName, 'proxyIP', proxyIP)
							let port = data.NetworkSettings.Ports['3002/tcp'][0].HostPort
							let proxy = createSyncProxy((err, req, res) => {
								res.sendStatus(425)
							})
							setSyncInMap(syncContainerName, 'port', port)
							setSyncInMap(syncContainerName, 'proxy', proxy)
							setSyncInMap(syncContainerName, 'ready', true)
							proxySyncContainer(op, syncContainerName, req, res)
						}
					})
				}
			})	
		} else if (getSyncInMap(syncContainerName).ready == true 
			&& getSyncInMap(syncContainerName).died == false 
			&& getSyncInMap(syncContainerName).proxy !== null) {

			// Ok proxy it. If there menawhile the sync die, it will be recreated
			proxySyncContainer(op, syncContainerName, req, res)
		}
	} catch (err) {
		console.log(err)
	}
}