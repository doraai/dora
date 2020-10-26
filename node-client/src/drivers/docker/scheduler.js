'use strict'

let Piperunner = require('piperunner')
let scheduler = new Piperunner.Scheduler()

scheduler.run({
	name: 'fetchWorkload', 
	pipeline: require('./pipelines/fetchWorkload').getPipeline('fetchWorkload'),
	run: {
		everyMs: 1000,
	},
	on: {
		end: {
			exec: [
				async (scheduler, pipeline) => {	
					scheduler.feed({
						name: 'createWorkload',
						data: pipeline.data().workloads.filter((workload) => {
							return workload.wants == 'RUN' && workload.status == 'RECV CREATE'
						}) 
					})

					scheduler.feed({
						name: 'deleteWorkload',
						data: pipeline.data().workloads.filter((workload) => {
							return workload.wants == 'STOP' && workload.status !== 'DELETING' && workload.status !== 'DELETED'
						}) 
					})

					scheduler.feed({
						name: 'statusWorkload',
						data: pipeline.data().workloads.filter((workload) => {
							return workload.status !== 'INSERTED' && workload.status !== 'DELETED'
						}) 
					})

					scheduler.emit('endFetchWorkload')
				}
			]
		}
	}
})

scheduler.run({
	name: 'createWorkload', 
	pipeline: require('./pipelines/createWorkload').getPipeline('createWorkload'),
	run: {
		onEvent: 'endFetchWorkload',
	}
})

scheduler.run({
	name: 'deleteWorkload', 
	pipeline: require('./pipelines/deleteWorkload').getPipeline('deleteWorkload'),
	run: {
		onEvent: 'endFetchWorkload',
	},
	on: {
		end: {
			emit: ['endDeletingWorkloads']
		}
	}
})

scheduler.run({
	name: 'statusWorkload', 
	pipeline: require('./pipelines/statusWorkload').getPipeline('statusWorkload'),
	run: {
		onEvent: 'endFetchWorkload',
	}
})

scheduler.emit('systemStart')
scheduler.log(false)

