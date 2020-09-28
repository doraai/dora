'use strict'

let R = require('./resource')
let Workload = require('./workload')


module.exports = class GPUWorkload extends Workload {

	schema () {
		return {
    	    apiVersion: String,
    	    kind: String,
    	    metadata: {name: String, group: String},
    	    spec: {
    	    	selectors: {
    	    		gpu: Object,
    	    		node: Object,
    	    		label: String
    	    	},
    	    	image: Object,
    	    	volumes: Array
    	    },
    	    created: {type: Date, default: new Date()},
    	    status: Array,
    	    currentStatus: String,
    	    scheduler: Object,
    	    locked: {type: Boolean, default: false}
		}
	}

	validate () {
		let validationResult = {global: true, steps: []}
		this._validate(this._p.kind, R.RV.EQUAL, this._kind, validationResult)
		this._validate(this._p.metadata, R.RV.NOT_EQUAL, undefined, validationResult)
		this._validate(this._p.metadata.name, R.RV.NOT_EQUAL, undefined, validationResult)
		this._validate(this._p.metadata.group, R.RV.NOT_EQUAL, undefined, validationResult)
		this._validate(this._p.spec, R.RV.NOT_EQUAL, undefined, validationResult)
		this._valid = validationResult
		return this
	}

	hasGpuAssigned () {
		return this._p.scheduler !== undefined && this._p.scheduler.gpu !== undefined
	}

	assignedGpu () {
		return this._p.scheduler.gpu.map((gpu) => {return gpu.uuid})	
	}

} 