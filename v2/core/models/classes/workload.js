'use strict'

let md5 = require('md5')
let check = require('check-types')
let BaseResource = require('./base')
let Container = require('./container')

class Workload extends BaseResource {
	static Kind = BaseResource.Interface.Kind.Workload

	static IsReplicated = true
	static IsZoned = true
	static IsWorkspaced = true

	static _PartitionKeyFromArgs (args) {
		let pargs = {}
		pargs.kind = args.kind || this.Kind.toLowerCase()
		pargs.zone = args.zone || (process.env.ZONE || 'dora-dev')
		if (args.workspace !== undefined && args.workspace !== 'All') {
			pargs.workspace = args.workspace
		}

		if (args.name !== undefined) {
			pargs.name = args.name
		}
		return pargs
	}

	static _PartitionKeyFromArgsForRead (args) {
		let pargs = {}
		pargs.kind = args.kind || this.Kind.toLowerCase()
		pargs.zone = args.zone || (process.env.ZONE || 'dora-dev')
		if (args.workspace !== undefined && args.workspace !== 'All') {
			pargs.workspace = args.workspace
		}
		if (args.name !== undefined) {
			pargs.name = args.name
		}
		return pargs
	}

	static  async _FormatOne (data) {

		let runningReplicas = 0
		let cData = await Container.Get({
			workload_id: data.id,
			zone: data.zone
		})

		if (cData.err == null) {
			cData.data.forEach((c) => {
				if (c.observed !== null) {
					if (c.observed.state == 'running' /*&& (new Date() -  new Date(c.observed.lastSeen)) < 10000*/ ) {
						runningReplicas += 1
					}
				}
			})
		}
		let eta = parseInt((new Date() - new Date(data.insdate)) / 1000) // s
		if (eta < 60) {
			eta += 's' 
		} else if (eta < 3600) {
			eta = parseInt(eta/60) + 'm' 
		} else if (eta < 86400) {
			eta = parseInt(eta/3600) + 'h' 
		} else {
			eta = parseInt(eta/86400) + 'd' 
		}
		
		return {
			kind: data.kind,
			zone: data.zone,
			workspace: data.workspace,
			name: data.name,
			desired: data.desired,
			image: data.resource.image.image,
			gpu: data.resource.selectors !== undefined &&  data.resource.selectors.gpu !== undefined ? data.resource.selectors.gpu.count : 0, 
			replica: runningReplicas + '/' + (data.resource.replica !== undefined ? ((data.resource.replica.count == undefined || data.resource.replica.count == null) ? 1 : data.resource.replica.count) : 1),
			eta: eta,
			state: data.observed !== undefined && data.observed !== null ? data.observed.state : null,
		}
	}

	static _ComputeResourceHash (resource) {
		try {
			let res = Object.assign({}, resource)
			if (res.replica !== undefined) {
				delete res.replica
			}
			return md5(this._DumpOneField(res))
		} catch (err) {
			return resource
		}	
	} 

	owner () {
		return this._p.owner
	}

	desiredReplica () {
		if (this._p !== undefined) {
			let replica = (this._p.resource.replica !== undefined  && this._p.resource.replica !== null) ? ((this._p.resource.replica.count == undefined || this._p.resource.replica.count == null) ? 1 :  this._p.resource.replica.count) : 1
			return parseInt(replica)
		} else {
			return 0
		}
		
	}

	computedReplica () {
		return (this._p.computed !== undefined && this._p.computed !== null) ? (this._p.computed.replica !== undefined ? (this._p.computed.replica) || 0 : 0) : 0
	}

	async isSteady (ContainerClass) {
		let isSteady = true
		let containers = await ContainerClass.Get({
			zone: this.zone(),
			workspace: this.workspace(),
			workload_id: this.id()
		})		
		if (containers.err == null) {
			containers = containers.data.map((c) => {
				return new ContainerClass(c)
			})
		}				
		// Check replica count
		if (containers.length != this.desiredReplica()) {
			isSteady = false
		}
		if (this.desired() == 'drain' && containers.length > 0) {
			isSteady = false	
		}
		if (this.desired() == 'run' && containers.length !== this.desiredReplica()) {
			isSteady = false
		}
		if (this.desired() == 'run') {
			for (var i = 0; i < containers.length; i += 1) {
				if (containers[i].resource_hash() !== this.resource_hash()) {
					isSteady = false
					break
				}
				if (!containers[i].isRunning() && !containers[i].isAssigned()) {
					isSteady = false
				}
			} 
		}

		return isSteady
	}

	/**
	*	Checks to do: 
	*	- zone exist
	*	- workspace exist
	*	- node exist
	*	- gpu/cpu kind exist
	*	- volume exist
	*/
	async $checkDependencies () {
		let checkAry = []
		const zone = this._p.zone
		const workspace = this._p.workspace
		const node = this._p.resource.selectors.node !== undefined ? this._p.resource.selectors.node.name : null
		
		const zoneExist = await this._checkOneDependency('Zone', {
			name: zone
		})
		const workspaceExist = await this._checkOneDependency('Workspace', {
			name: workspace
		})
		let nodeExist = [true]
		if (node !== 'pwm.all' && node !== 'All' && node !== null) {
			nodeExist = await this._checkOneDependency('Node', {
				name: node,
				zone: zone
			})
		}

		if (zoneExist.length == 1 && workspaceExist.length == 1 && nodeExist.length == 1) {
			return {err: null, data: []}
		} else {
			if (zoneExist.length == 0) {
				checkAry.push('Zone ' + zone + ' not exist')
			}
			if (workspaceExist.length == 0) {
				checkAry.push('Workspace ' + workspace + ' not exist')
			}
			if (nodeExist.length == 0) {
				checkAry.push('Node ' + node + ' not exist')
			}
			return {err: true, data: checkAry}	
		}
	}

	$check () {
		let checkAry = super.$check()
		this._check(checkAry, check.not.equal(this._p.resource, null), 						'Resource spec must not be null')
		this._check(checkAry, check.not.equal(this._p.resource, undefined), 				'Resource spec must not be undefined')
		this._check(checkAry, check.not.equal(this._p.resource.image, undefined), 			'Resource spec.image must not be undefined')
		this._check(checkAry, check.not.equal(this._p.resource.image.image, undefined), 	'Resource spec.image.image must not be undefined')
		this._check(checkAry, check.not.equal(this._p.resource.image.image,  null),  	    'Resource spec.image.image must not be null')
		this._check(checkAry, check.not.equal(this._p.resource.driver, undefined),  		'Resource spec.driver must not be undefined')
		this._check(checkAry, check.not.equal(this._p.resource.driver, null),  				'Resource spec.driver must not be null')
		this._check(checkAry, check.not.equal(this._p.resource.config, null),  				'Resource spec.config must not be null')
		this._check(checkAry, check.not.equal(this._p.resource.config, undefined),  	    'Resource spec.config must not be null')
		this._check(checkAry, check.not.equal(this._p.resource.selectors, undefined),  	    'Resource spec.selectors must not be undefined')
		this._check(checkAry, check.not.equal(this._p.resource.selectors, null),  	        'Resource spec.selectors must not be null')
		this._check(checkAry, check.not.equal(this._p.resource.replica, null),  	        'Resource spec.replica must not be null')
		this._check(checkAry, check.not.equal(this._p.resource.replica, undefined),  	    'Resource spec.replica must not be undefined')


		// Replica specific test
		if (this._p.resource.replica == undefined || this._p.resource.replica == null) {
			checkAry.push({result: false, desc: 'Replica value cannot be unset'})
		} 
		if (this._p.resource.replica != undefined && this._p.resource.replica != null) {
			if (this._p.resource.replica.count == undefined || this._p.resource.replica.count == null || this._p.resource.replica.count == 'null') {
				checkAry.push({result: false, desc: 'Replica count value cannot be unset'})
			} else {
				if (typeof this._p.resource.replica.count !== 'number') {
					checkAry.push({result: false, desc: 'Replica count value cannot must be a number'})
				} else if (!Number.isInteger(this._p.resource.replica.count)) {
					checkAry.push({result: false, desc: 'Replica count value cannot must be an integer'})
				} else if (this._p.resource.replica.count < 0) {
					checkAry.push({result: false, desc: 'Replica count value cannot must be greater or equal to zero'})
				}								
			}
		}	
		
		// Cpu selectors
		if (this._p.resource.selectors != undefined && this._p.resource.selectors != undefined && this._p.resource.selectors.cpu != null && this._p.resource.selectors.cpu != undefined) {
			if (this._p.resource.selectors.cpu.count == undefined || this._p.resource.selectors.cpu.count == null || this._p.resource.selectors.cpu.count == 'null') {
				checkAry.push({result: false, desc: 'Cpu count value cannot be unset'})
			} else {
				if (typeof this._p.resource.selectors.cpu.count == 'number') {
					if (!Number.isInteger(this._p.resource.selectors.cpu.count)) {
						checkAry.push({result: false, desc: 'Cpu count as number must be an integer'})
					} else if (this._p.resource.selectors.cpu.count < 0) {
						checkAry.push({result: false, desc: 'Cpu count value cannot must be greater or equal to zero'})
					}						
				} else if (typeof this._p.resource.selectors.cpu.count == 'string') {
					if (this._p.resource.selectors.cpu.count[this._p.resource.selectors.cpu.count.length - 1] !== 'm') {
						checkAry.push({result: false, desc: 'Cpu count as string must end with "m" char'})
					} else {
						let lastM = this._p.resource.selectors.cpu.count.split('m')[0]
						if (!Number.isInteger(Number(lastM))) {
							checkAry.push({result: false, desc: 'Cpu count as string must container a valid integer before the "m" end char'})
						}
					}
				}
			}
		}			

		// Gpu selectors
		if (this._p.resource.selectors != undefined && this._p.resource.selectors != undefined && this._p.resource.selectors.gpu != null && this._p.resource.selectors.gpu != undefined) {
			if (this._p.resource.selectors.gpu.count == undefined || this._p.resource.selectors.gpu.count == null || this._p.resource.selectors.gpu.count == 'null') {
				checkAry.push({result: false, desc: 'Gpu count value cannot be unset'})
			} else {
				if (typeof this._p.resource.selectors.gpu.count == 'number') {
					if (!Number.isInteger(this._p.resource.selectors.gpu.count)) {
						checkAry.push({result: false, desc: 'Gpu count as number must be an integer'})
					} else if (this._p.resource.selectors.gpu.count < 0) {
						checkAry.push({result: false, desc: 'Gpu count value cannot must be greater or equal to zero'})
					}						
				} else {
					if (!Number.isInteger(Number(this._p.resource.selectors.gpu.count))) {
						checkAry.push({result: false, desc: 'Gpu count value must be a number'})
					} 
					
				}
			}
		}			
		
		if (this._p.resource.config !== undefined && (this._p.resource.config.restartPolicy == undefined || this._p.resource.config.restartPolicy == null)) {
			this._p.resource.config.restartPolicy = 'Never'
		}

		return checkAry
	}

}

module.exports = Workload