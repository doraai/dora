'use strict'

let fs = require('fs')
let axios = require('axios')
let async = require('async')
let bodyParser = require('body-parser')
let express = require('express')
let randomstring = require('randomstring')
let session = require('express-session')
let history = require('connect-history-api-fallback')
const expressIpFilter = require('express-ipfilter').IpFilter
const IpDeniedError = require('express-ipfilter').IpDeniedError
const querystring = require('querystring')
const pem = require('pem')
let cors = require('cors')
let http = require('http')
let httpProxy = require('http-proxy')
let crypto = require('crypto')
let jwt = require('jsonwebtoken')
const bearerToken = require('express-bearer-token')

const rateLimiter = require('./src/rate-limiter')
const ipFilter = require('./src/ip-filter')


let ipFromReq = (req) => {
	let ip = req.headers['x-original-forwarded-for'] || req.headers['x-forwarded-for'] || req.connection.remoteAddress
	return ip
}


let api = {
	v1: require('../core').Api.Interface, 
	'v1.experimental': require('../core').Api.Interface, 
	v2: require('../core').Api.Interface
}

let VolumeOperations = require('../core').Driver.DockerVolumeOperations

let Class = require('../core').Model.Class

let StartServer = true

function getUserDataFromRequest(req) {
	return {user: req.session.user, userGroup: req.session.userGroup, defaultGroup: req.session.defaultGroup}
}

const { version } = require('./package.json')

let app = express()
const server = http.createServer(app)
app.use(bodyParser.json({limit: '200mb', extended: true}))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(session({
 secret: process.env.secret || 'DORA-API',
 resave: false,
 saveUninitialized: true,
 cookie: { secure: true }
}))

app.enable('trust proxy', true)

/**
*	Middlewares
*/
app.use(history())
app.use(cors())

app.use(expressIpFilter(ipFilter.ipBlacklist()))

app.use((err, req, res, _next) => {
 	if (err instanceof IpDeniedError) {
 	  	res.sendStatus(401)
 	} else {
 		_next()
 	}
})

app.use(rateLimiter)

app.use(bearerToken())

app.use(express.static('public'))

app.all('*', (req, res, next) => {
	next()
})


/**
*	G I T H U B 
*	W E B H O O K
*/
app.post('/v1/igw/:zone/:workspace/:name/:path', (req, res, next) => {
	let checkHeader = req.headers['x-hub-signature-256']
	if (checkHeader == undefined || checkHeader == null) {
		ipFilter.addIpToBlacklist(ipFromReq(req))	
		res.sendStatus(404)		
		return	
	}
	let objRequest = {
		kind: 'Workload',
		metadata: {
			zone: req.params.zone || process.env.ZONE,
			workspace: req.params.workspace,
			group: req.params.workspace,
			name: req.params.name
		}
	}
	api['v1']['describe']('v1', objRequest, (err, result) => {
		if (err == null) {
			if (result.length == 1) {
				let wk = result[0]
				let meta = wk.meta
				if (meta !== null && meta !== undefined && meta.integrations !== undefined && meta.integrations.github !== undefined && meta.integrations.github.webhooks !== undefined) {
					let found = false
					meta.integrations.github.webhooks.forEach ((wb) => {
						if (wb.path == req.params.path) {
							found = wb
						}
					})
					if (found == false) {
						ipFilter.addIpToBlacklist(ipFromReq(req))	
						res.sendStatus(404)							
					} else {
						if (found.active != true) {
							ipFilter.addIpToBlacklist(ipFromReq(req))	
							res.sendStatus(404)	
							return
						}
						let appsecret_proof
						try {
							appsecret_proof = crypto.createHmac('sha256', found.secret).update(JSON.stringify(req.body)).digest('hex')	
						} catch (err) {
							console.log(err)
						}
						
						if ('sha256=' + appsecret_proof == checkHeader) {
							let refHook = req.body.ref

							let refHookSplit = ''
							let branch = ''
							try {
								refHookSplit = refHook.split('/')
								if (refHookSplit !== undefined &&  refHookSplit !== null && refHookSplit.length > 0) {
									branch = refHookSplit[refHookSplit.length - 1]
								} 
							} catch (err) {
								console.log('Error in split refHook', refHook)
							}
							console.log('Branch check', found.branch, branch)
							if (found.branch !== undefined && found.branch !== null && found.branch !== '' && found.branch !== 'All') {
								if (found.branch != branch) {
									res.sendStatus(200)
									return
								}
							}

							let wkFormatted = {
								kind: 'Workload',
								metadata: {
									name: wk.name,
									workspace: wk.workspace,
									group: wk.workspace,
									zone: wk.zone,
								},
								meta: wk.meta,
								spec: wk.resource
							}
							switch (found.requestedAction) {
								
								case 'ScaleUp':
									wkFormatted.spec.replica.count = parseInt(wkFormatted.spec.replica.count) + 1
									api['v1']['apply']('v1', wkFormatted, (err, result) => {
										if (err == null) {
											res.sendStatus(200)
										} else {
											res.sendStatus(501)
										}
									})
									break;

								case 'Stop':
									wkFormatted.spec.replica.count = 0
									api['v1']['apply']('v1', wkFormatted, (err, result) => {
										if (err == null) {
											res.sendStatus(200)
										} else {
											res.sendStatus(501)
										}
									})
									break;

								case 'Logs':
									break;

								case 'ScaleDown':	
									if (parseInt(wkFormatted.spec.replica.count) <= 0) {
										res.sendStatus(501)
										return
									} 
									wkFormatted.spec.replica.count = parseInt(wkFormatted.spec.replica.count) - 1
									api['v1']['apply']('v1', wkFormatted, (err, result) => {
										if (err == null) {
											res.sendStatus(200)
										} else {
											res.sendStatus(501)
										}
									})		
									break;
								default:
									res.sendStatus(404)					
							}
							
						} else {
							ipFilter.addIpToBlacklist(ipFromReq(req))	
							res.sendStatus(401)												
						}
					}
				} else {
					ipFilter.addIpToBlacklist(ipFromReq(req))	
					res.sendStatus(404)					
				}
			} else {
				ipFilter.addIpToBlacklist(ipFromReq(req))	
				res.sendStatus(404)
			}
		} else {
			ipFilter.addIpToBlacklist(ipFromReq(req))
			res.sendStatus(404)
		}
	})
})



/**
*	Pre auth routes
*/
app.all('/:apiVersion/**', (req, res, next) => {
	if (api[req.params.apiVersion] == undefined) {
		res.sendStatus(401)
	} else {
		next()
	}
})

app.all('/:apiVersion/:zone/:group/:resourceKind/:operation', (req, res, next) => {
	api[req.params.apiVersion].checkUser(req, (response) => {
		if (response.err == null && response.data == true) {
			next()
		} else {
			if (response.data == false) {
				ipFilter.addIpToBlacklist(ipFromReq(req))
				res.sendStatus(401)	
			} else {
				res.sendStatus(500)	
			}
		}
	})	
})

app.all('/:apiVersion/:zone/:group/:resourceKind/:operation/*', (req, res, next) => {
	api[req.params.apiVersion].checkUser(req, (response) => {
		if (response.err == null && response.data == true) {
			next()
		} else {
			if (response.data == false) {
				ipFilter.addIpToBlacklist(ipFromReq(req))
				res.sendStatus(401)	
			} else {
				res.sendStatus(500)	
			}
		}
	})	
})

app.all('/:apiVersion/:zone/:group/:resourceKind/:operation/:name/**', (req, res, next) => {
	api[req.params.apiVersion].checkUser(req, (response) => {
		if (response.err == null && response.data == true) {
			next()
		} else {
			if (response.data == false) {
				ipFilter.addIpToBlacklist(ipFromReq(req))
				res.sendStatus(401)	
			} else {
				res.sendStatus(500)	
			}
		}
	})	
})


app.all('/:apiVersion/:zone/:group/Workspace/clone/:newName', (req, res, next) => {
	let wsToClone = req.params.group
	if (req.params.group == '-') {
		wsToClone = req.session.defaultWorkspace 
	} 	
	
	let newName = wsToClone + '.' + req.params.newName
	api[req.params.apiVersion]['apply'](req.params.apiVersion, {
		kind: 'Workspace',
		metadata: {
			name: newName
		}
	}, (err, result) => {
		if (err != null) {
			res.json({done: false})		
		} else {
			api[req.params.apiVersion].getOne(req.params.apiVersion, {kind: 'User', metadata: {name: req.session.user, group: req.session.userGroup}}, async (err, result) => {
				if (result.length == 1) {
					let user = new Class.User(result[0])
					let exist = await user.$exist() 
					if (exist.err == null && exist.data.exist == true) {
						user = new Class.User(exist.data.data)
						res.json(await user.cloneWorkspaceFrom(wsToClone, newName))
					} else {
						res.sendStatus(404)
					}
				} else {
					res.sendStatus(404)
				}
				
			}, false)	
		}
	})
})


/**
*	User routes
*/
app.post('/:apiVersion/:zone/:group/user/validate', (req, res) => {
	res.json({status: 200, name: req.session.user})
})

app.post('/:apiVersion/:zone/:group/user/groups', async (req, res) => {
	api[req.params.apiVersion].getOne(req.params.apiVersion, {kind: 'User', metadata: {name: req.session.user, group: req.session.userGroup}}, async (err, result) => {
		if (result.length == 1) {
			let user = new Class.User(result[0])
			let exist = await user.$exist() 
			if (exist.err == null && exist.data.exist == true) {
				user = new Class.User(exist.data.data)
				res.json(await user.workspaces(Class))
			} else {
				res.sendStatus(404)
			}
		} else {
			res.sendStatus(404)
		}
		
	}, false)
})

app.post('/:apiVersion/:zone/-/User/credits', (req, res) => {
	api[req.params.apiVersion].getOne(req.params.apiVersion, {kind: 'Usercredit', metadata: {name: req.session.user, zone: req.params.zone}}, async (err, result) => {
		if (result.length == 1) {
			let user = new Class.Usercredit(result[0])
			res.json(user._p.computed)
		} else {
			res.sendStatus(200)
		}
		
	}, false)
})

/**
*	Api routes
*/
app.post('/:apiVersion/:zone/:group/api/version', (req, res) => {
	res.json(version)
})

app.post('/:apiVersion/:zone/:group/api/compatibility', (req, res) => {
	let map = {
		api: {}
	}
	map.api[version] = {cli: [version]}
	res.json({compatible: map.api[version].cli.includes(req.body.data.cliVersion)})
})

/**
*	Token api routes
*/
app.post('/:apiVersion/:zone/:group/Container/token', (req, res) => {
	let g = req.params.group == '-' ? req.session.defaultGroup : req.params.group
	let token = jwt.sign({
	  exp: Math.floor(Date.now() / 1000) + (5), // 5 seconds validity
	  data: {user: req.session.user, group: g, zone: req.params.zone}
	}, process.env.secret)
	res.json(token)
})

app.post('/:apiVersion/:zone/:group/token/create', (req, res) => {
	let dataToken = {
	  	data: {user: req.body.data.user, userGroup: req.body.data.userGroup, defaultGroup: req.body.data.defaultGroup || req.body.data.user, id: req.body.data.id || 1}
	}
	if (req.body.exp !== undefined) {
		dataToken.exp = Math.floor(Date.now() / 1000) + (req.body.exp * 60)
	}
	let token = jwt.sign(dataToken, process.env.secret)
	res.json(token)
})

/**
*	Apply/Delete/Stop route for resource 
*/
app.post('/:apiVersion/:zone/:group/:resourceKind/:operation', async (req, res) => {

	if (Class[req.params.resourceKind] == undefined) {
		res.json({err: true, data: 'Resource Kind not exist'})
		return
	}

	let data = req.body.data == undefined ? {kind: req.params.resourceKind} : req.body.data
	// console.log('AT APi', data)
	if (Class[req.params.resourceKind].IsZoned == true) {
		if (data.metadata == undefined) {
			data.metadata = {}	
			// Adeded
			data.metadata.zone = process.env.ZONE
		}
		// REMOVED
		// data.metadata.zone = process.env.ZONE
	}
	if (Class[req.params.resourceKind].IsWorkspaced == true) {
		if (data.metadata == undefined) {
			data.metadata = {}	
		}
		if (req.params.group == '-' && data.metadata.group == undefined) {
			data.metadata.group = req.session.defaultWorkspace 
			data.metadata.workspace = req.session.defaultWorkspace 
		} else if (req.params.group == '-' && data.metadata.group != undefined) {
			// It's ok
		} else {
			data.metadata.group = req.params.group	
			data.metadata.workspace = req.params.group	
		}
	}
	if (data.metadata !== undefined) {
		if (req.params.zone !== '-' ) {
			data.metadata.zone = req.params.zone
		} else {
			if (data.metadata.zone == undefined || data.metadata.zone == null) {
				data.metadata.zone = process.env.ZONE	
			}
		}			
		// if (req.params.zone !== '-' ) {
		// 	data.metadata.zone = req.params.zone
		// } else {
		// 	data.metadata.zone = process.env.ZONE
		// }
	}
	// console.log('AT APi END', data)
	data.owner = req.session.user
	api[req.params.apiVersion][req.params.operation](req.params.apiVersion, data, (err, result) => {
		res.json(result)
	})
	
})

let proxy
if (StartServer == true) { 
	if (process.env.USE_CUSTOM_CA_SSL_CERT == true || process.env.USE_CUSTOM_CA_SSL_CERT == 'true') {
		const CA_CRT = fs.readFileSync(process.env.SSL_CA_CRT  || '/etc/ssl/certs/pwmca.pem')
		proxy = httpProxy.createProxyServer({
			ca: CA_CRT,
			proxyTimeout: 1000 * 60 * 60 * 24, timeout: 1000 * 60 * 60 * 24, 
			checkServerIdentity: function (host, cert) {
				return undefined
			},
		})
		proxy.on('error', function (err, req, res) {
		  //res.writeHead(500, { 'Content-Type': 'text/plain'})
		  res.end('Something went wrong')
		  console.error('Proxy err', err)
		})
	} else {
		proxy = httpProxy.createProxyServer({secure: process.env.DENY_SELF_SIGNED_CERTS || false, proxyTimeout: 1000 * 60 * 60 * 24, timeout: 1000 * 60 * 60 * 24 })
		proxy.on('error', function (err, req, res) {
		  //res.writeHead(500, { 'Content-Type': 'text/plain'})
		  res.end('Something went wrong')
		  console.error('Proxy err', err)
		})
	}
} else {
	proxy = httpProxy.createProxyServer({proxyTimeout: 1000 * 60 * 60 * 24, timeout: 1000 * 60 * 60 * 24 })
	proxy.on('error', function (err, req, res) {
	  //res.writeHead(500, { 'Content-Type': 'text/plain'})
	  res.end('Something went wrong')
	  console.error('Proxy err', err)
	})
}

/*
*	Containers direct access operations like logs, inspect, top, commit
*/
app.post('/:apiVersion/:zone/:group/Workload/:operation/:name/', (req, res) => {
	let wkName = req.params.name
	api['v1'].describe({ metadata: {name: wkName, group: req.params.group}, kind: 'Workload'}, (err, result) => {
		if (result.metadata !== undefined && result.metadata.name !== undefined && result.metadata.name == wkName) {
			req.url += 'pwm.' + req.params.group + '.' + req.params.name
			api['v1'].describe({ metadata: {name: result.scheduler.node, group: GE.LABEL.PWM_ALL}, kind: 'Node'}, (err, resultNode) => {
				if (resultNode.spec.token !== undefined) {
					req.headers.authorization = 'Bearer ' + resultNode.spec.token	
				}
				proxy.web(req, res, {target: 'https://' + result.scheduler.nodeProperties.address[0]})
			})
		} else {
			res.sendStatus(404)
		}
	})
})


////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////

let uploadMem = {}

app.all('/v1.experimental/:zone/:group/Volume/upload/:volumeName/:info/:uploadId/:storage/*', (req, res) => {
	console.log(req.url)
	let workspace = req.params.group !== '-' ?  req.params.group : req.session.defaultGroup
	let uploadId = 'dora.volume.' + workspace + '.' + req.params.volumeName
	let getUploadStorageData = function (cb) {
		let volumeName = req.params.volumeName
		let workspace = req.params.group !== '-' ?  req.params.group : req.session.defaultGroup
		api['v2'].getOne('v2', {
			kind: 'Volume',
			workspace: workspace,
			name: req.params.volumeName
		}, (err, resultVolume) => {
			if (resultVolume.length == 1) {
				api['v2'].getOne('v2', {
					kind: 'Storage',
					name: resultVolume[0].storage
				}, (err, resultStorage) => {
					if (resultStorage.length == 1) {
						let storageData = {
							rootName: resultStorage[0].name,
							kind: resultStorage[0].type,
							name: 'dora.volume.' + workspace + '.' + req.params.volumeName,
							containerName: 'dora.sync.' + workspace + '.' + req.params.volumeName,
							group: workspace,
							server: resultStorage[0].endpoint,
							rootPath: resultStorage[0].mountpath,
							subPath: req.params.volumeName,
							policy: resultVolume[0].policy || 'rw',
							nodeAddress: process.env.HOST_IP || '0.0.0.0'
						}
						uploadMem[uploadId] = {
							storageData: storageData
						}
						cb({err: null, data: storageData})
					} else {
						cb({err: true, data: null})
					}
				})
			} else {
				cb({err: true, data: null})
			}
		})
	}
	let execProxy = () => {
		req.headers.authorization = 'Bearer ' + uploadMem[uploadId].nodeToken
		let storage = encodeURIComponent(JSON.stringify(uploadMem[uploadId].storageData))	
		// let host = '192.168.180.150'
		// let port = 3001
		let url = `${'https://' + uploadMem[uploadId].proxyAddress}/-/${'v1.experimental'}/${req.params.group}/Volume/upload/${req.params.volumeName}/-/${encodeURIComponent(uploadId)}/${storage}/${encodeURIComponent(req.params['0'])}`
		proxy.web(req, res, {target: url, ignorePath: true})
	} 

	let upload = (storageData, req, res) => {
		switch (storageData.kind.toLowerCase()) {
			case 'nfs': // Proxy direct to storage
				req.params.storage = storageData
				VolumeOperations.operation('upload', req, res)
			case 'local': // Proxy to node
				break
	
		} 
	}

	if (uploadMem[uploadId] == undefined) {
		getUploadStorageData((response) => {
			if (response.err == null) {
				upload(uploadMem[uploadId].storageData, req, res)
			} else {
				res.sendStatus(403)
			}
		})
	} else {
		upload(uploadMem[uploadId].storageData, req, res)
	} 

})

app.post('/v1.experimental/:zone/:group/Volume/ls/:volumeName/:path', (req, res) => {
	console.log(req.url)
	let workspace = req.params.group !== '-' ?  req.params.group : req.session.defaultGroup
	let uploadId = 'dora.volume.' + workspace + '.' + req.params.volumeName
	let getUploadStorageData = function (cb) {
		let volumeName = req.params.volumeName
		api['v2'].getOne('v2', {
			kind: 'Volume',
			workspace: workspace,
			name: req.params.volumeName
		}, (err, resultVolume) => {
			if (resultVolume.length == 1) {
				api['v2'].getOne('v2', {
					kind: 'Storage',
					name: resultVolume[0].storage
				}, (err, resultStorage) => {
					if (resultStorage.length == 1) {
						let storageData = {
							rootName: resultStorage[0].name,
							kind: resultStorage[0].type,
							name: 'dora.volume.' + workspace + '.' + req.params.volumeName,
							containerName: 'dora.sync.' + workspace + '.' + req.params.volumeName,
							group: workspace,
							server: resultStorage[0].endpoint,
							rootPath: resultStorage[0].mountpath,
							//subPath: workspace + '/' + req.params.volumeName,
							subPath: req.params.volumeName,
							policy: resultVolume[0].policy || 'rw',
							nodeAddress: process.env.HOST_IP || '0.0.0.0'
						}
						uploadMem[uploadId] = {
							storageData: storageData
						}
						cb({err: null, data: storageData})
					} else {
						cb({err: true, data: null})
					}
				})
			} else {
				cb({err: true, data: null})
			}
		})
	}
	let execProxy = () => {
		req.headers.authorization = 'Bearer ' + uploadMem[uploadId].nodeToken
		let storage = encodeURIComponent(JSON.stringify(uploadMem[uploadId].storageData))	
		// let host = '192.168.180.150'
		// let port = 3001
		let url = `${'https://' + uploadMem[uploadId].proxyAddress}/${'v1.experimental'}/-/${req.params.group}/Volume/ls/${req.params.volumeName}/-/${encodeURIComponent(uploadId)}/${storage}/${encodeURIComponent(req.params['0'])}`
		proxy.web(req, res, {target: url, ignorePath: true})
	} 
	
	let ls = (storageData, req, res) => {
		switch (storageData.kind.toLowerCase()) {
			case 'nfs': // Proxy direct to storage
				req.params.storage = storageData
				req.url += '/-'
				VolumeOperations.operation('ls', req, res)
			case 'local': // Proxy to node

				break
	
		} 
	}

	if (uploadMem[uploadId] == undefined) {
		getUploadStorageData((response) => {
			if (response.err == null) {
				ls(uploadMem[uploadId].storageData, req, res)
			} else {
				res.sendStatus(403)
			}
		})
	} else {
		ls(uploadMem[uploadId].storageData, req, res)
	} 
})

app.post('/v1.experimental/:zone/:group/Volume/download/:volumeName/:path', (req, res) => {
	console.log(req.url)
	let workspace = req.params.group !== '-' ?  req.params.group : req.session.defaultGroup
	let uploadId = 'dora.volume.' + workspace + '.' + req.params.volumeName	
	let getUploadStorageData = function (cb) {
		let volumeName = req.params.volumeName
		// let workspace = req.params.group !== '-' ?  req.params.group : req.session.defaultGroup
		api['v2'].getOne('v2', {
			kind: 'Volume',
			workspace: workspace,
			name: req.params.volumeName
		}, (err, resultVolume) => {

			if (resultVolume.length == 1) {
				api['v2'].getOne('v2', {
					kind: 'Storage',
					name: resultVolume[0].storage
				}, (err, resultStorage) => {

					if (resultStorage.length == 1) {
						let storageData = {
							rootName: resultStorage[0].name,
							kind: resultStorage[0].type,
							name: 'dora.volume.' + workspace + '.' + req.params.volumeName,
							containerName: 'dora.sync.' + workspace + '.' + req.params.volumeName,
							group: workspace,
							server: resultStorage[0].endpoint,
							rootPath: resultStorage[0].mountpath,
							//subPath: workspace + '/' + req.params.volumeName,
							subPath: req.params.volumeName,
							policy: resultVolume[0].policy || 'rw',
							nodeAddress: process.env.HOST_IP || '0.0.0.0'
						}
						uploadMem[uploadId] = {
							storageData: storageData
						}
						cb({err: null, data: storageData})
					} else {
						cb({err: true, data: null})
					}
				})
			} else {
				cb({err: true, data: null})
			}
		})
	}

	
	let download = (storageData, req, res) => {
		switch (storageData.kind.toLowerCase()) {
			case 'nfs': // Proxy direct to storage
				req.params.storage = storageData
				req.url += '/-'
				VolumeOperations.operation('download', req, res)
			case 'local': // Proxy to node

				break
	
		} 
	}

	if (uploadMem[uploadId] == undefined) {
		getUploadStorageData((response) => {
			if (response.err == null) {

				download(uploadMem[uploadId].storageData, req, res)
			} else {
				res.sendStatus(403)
			}
		})
	} else {
		download(uploadMem[uploadId].storageData, req, res)
	} 
})

////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////

server.on('upgrade', function (req, socket, head) {
	try {
		
		let qs = querystring.decode(req.url.split('?')[1])
 		let authUser = jwt.verify(qs.token, process.env.secret).data.user
 		//logger.pwmapi.info(GE.LOG.SHELL.REQUEST, authUser, qs.containername, GE.ipFromReq(req))
 		if (authUser) {
 			let _zone = qs.zone || process.env.ZONE
 			if (_zone == '-') {
 				_zone = process.env.ZONE
 			}
 			let authGroup = jwt.verify(qs.token, process.env.secret).data.group
 			api['v1'].describe('v1', {kind: 'Container', metadata: {name: qs.containername, group: authGroup, zone: _zone}}, (err, result) => {
 				if (result.length == 1) {
 					result = result[0]
 				} else {
 					return
 				}
 				if (result.observed !== undefined && result.observed !== null && result.observed.state == 'running') {
 					if (result.workspace == authGroup) {
						api['v1'].describe('v1', { metadata: {name: qs.node}, kind: 'Node'}, (err, resultNode) => {
 							if (resultNode.length == 1) {
 								resultNode = resultNode[0]
 							} else {
 								return
 							}
							if (resultNode.resource.token !== undefined) {
								req.headers.authorization = 'Bearer ' + resultNode.resource.token
							}
							proxy.ws(req, socket, head, {target: 'wss://' + resultNode.resource.endpoint.split('://')[1]})	
						})
 					} else {
 						//logger.pwmapi.error('401', GE.LOG.SHELL.GROUP_NOT_MATCH, authUser, qs.containername, authGroup, GE.ipFromReq(req))
 					}
 				} else {
 					//logger.pwmapi.warn('401', GE.LOG.SHELL.WK_NOT_RUNNING, authUser, qs.containername, authGroup, GE.ipFromReq(req))
 				}
 			})
		} else {
			////logger.pwmapi.error('401', GE.LOG.SHELL.NOT_AUTH, authUser, qs.containername, authGroup, GE.ipFromReq(req))
		}
	} catch (err) {
		console.log('ws upgrade:', err)
		////logger.pwmapi.fatal(GE.LOG.SHELL.REQUEST, err.toString(), GE.ipFromReq(req))
	}
})

proxy.on('error', function (err) {
 	console.log('error', err)
})

if (StartServer == true) {
	server.listen(process.env.port || 3000)
}

process.on('unhandledRejection', (reason, p) => {
 console.log('Unhandled Rejection at: Promise', p, 'reason:', reason)
})