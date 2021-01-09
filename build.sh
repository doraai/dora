#!/bin/bash

# T O  C O N F I G U R E
REGISTRY00="promfacility"
REGISTRY0="dr.trentinosviluppo.it"
REGISTRY1=$REGISTRY0 
REGISTRY2="registry.promfacility.eu"

#
# L E A V E  
#

if [ $1 == "buildfront" ]; then
	cd app/
	npm run build 
	cp -R dist/* ../controlplane/api/public/
fi

if [ $1 == "buildlight" ]; then
	docker build -t pwm-light -f tiny/Dockerfile .
	docker tag pwm-light promfacility/pwm-light
	docker push promfacility/pwm-light
fi

if [ $1 == "buildnode" ]; then
	docker build -t pwmnode -f node-client/Dockerfile node-client/
	docker build -t pwmnode-update -f node-client-updater/Dockerfile node-client-updater/
fi

if [ $1 == "build" ]; then
	if [ $2 == "all" ]; then
		docker build -t pwm-api -f controlplane/api/Dockerfile controlplane/
		docker build -t pwm-scheduler -f controlplane/scheduler/Dockerfile controlplane/
		docker build -t pwm-scheduler-occ -f controlplane/scheduler-occ/Dockerfile controlplane/
		docker build -t pwm-scheduler-executor -f controlplane/scheduler-executor/Dockerfile controlplane/
		docker build -t pwm-messenger -f controlplane/messenger/Dockerfile controlplane/
	else
		docker build -t pwm-$2 -f controlplane/$2/Dockerfile controlplane/
	fi
fi

if [ $1 == "push" ]; then
	if [ $2 == "light" ]; then
		docker tag pwm-light $REGISTRY00/pwm-light
		docker push $REGISTRY00/pwm-light
	fi

	if [ $2 == "node" ]; then
		docker tag pwmnode $REGISTRY2/pwmnode
		docker push $REGISTRY2/pwmnode
	fi

	if [ $2 == "all" ]; then
		docker tag pwm-api $REGISTRY1/pwm-api
		docker tag pwm-scheduler $REGISTRY1/pwm-scheduler
		docker tag pwm-scheduler-executor $REGISTRY1/pwm-scheduler-executor
		docker tag pwm-scheduler-occ $REGISTRY1/pwm-scheduler-occ
		docker tag pwm-messenger $REGISTRY1/pwm-messenger
		#docker tag pwm-node $REGISTRY1/pwm-node

		docker push $REGISTRY1/pwm-api
		docker push $REGISTRY1/pwm-scheduler
		docker push $REGISTRY1/pwm-scheduler-occ
		docker push $REGISTRY1/pwm-scheduler-executor
		#docker push $REGISTRY1/pwm-messenger
		#docker push $REGISTRY1/pwmnode

	else
		docker tag $2 $REGISTRY1/$2
		docker push $REGISTRY1/$2
	fi
fi
