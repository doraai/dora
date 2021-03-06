'use strict'

let BaseResource = require('./base')

class User extends BaseResource {
	static Kind = BaseResource.Interface.Kind.User

	static IsReplicated = false
	static IsZoned = false
	static IsWorkspaced = false

	async cloneWorkspaceFrom (fromName, toName) {
		let userSpec = this.resource()
		let toAdd = []
		for (var i = 0; i < userSpec.resources.length; i += 1) {
			let permission = userSpec.resources[i]
			if (permission.workspace == fromName) {
				let currentPermission = JSON.parse(JSON.stringify(permission))
				currentPermission.workspace = toName
				toAdd.push(currentPermission)
			}
		}
		for (var i = 0; i < toAdd.length; i += 1) {
			userSpec.resources.push(toAdd[i])
		}
		let response = await this.updateResource()
		return response
	}

	async workspaces (Class) {
		let RoleClass = Class.Role
		let WorkspaceClass = Class.Workspace
		let ZoneClass = Class.Zone
		let userSpec = this.resource()
		let data = userSpec
		data.tree = {zone: {}}
		for (var i = 0; i < userSpec.resources.length; i += 1) {
			if (userSpec.resources[i].workspace !== null && userSpec.resources[i].workspace !== undefined) {
				let res = await RoleClass.GetOne({
					name: userSpec.resources[i].role
				})
				let resSpec = userSpec.resources[i]
				let zones = []
				if (resSpec.zone == 'All') {
					let _resZone = await ZoneClass.Get({})

					_resZone.data.forEach((z) => {
						zones.push(z.name) 
					})
				} else {
					zones.push(resSpec.zone)
				}
				

				for (var z = 0; z < zones.length; z += 1) {
					resSpec.zone = zones[z]
					let role = res.data[0]
					data.resources[i].permission = role.resource.permission
					if (data.tree.zone[resSpec.zone] == undefined) {
						data.tree.zone[resSpec.zone] = {
							workspace: {}
						}
					}
					if (resSpec.workspace == 'All') {
						let allWorkspaces = await WorkspaceClass.Get({})
						
						allWorkspaces.data.forEach((ws) => {
							if (data.tree.zone[resSpec.zone].workspace[ws.name] == undefined) {
								data.tree.zone[resSpec.zone].workspace[ws.name] = ws.name
							}
							if (resSpec.kind == 'All') {
								data.tree.zone[resSpec.zone].workspace[ws.name] = role.resource.permission
							} else {
								data.tree.zone[resSpec.zone].workspace[ws.name][resSpec.kind] = role.resource.permission[resSpec.kind]
							}
						})
					} else {
						if (data.tree.zone[resSpec.zone].workspace[resSpec.workspace] == undefined) {
							data.tree.zone[resSpec.zone].workspace[resSpec.workspace] = {}
						}
						if (resSpec.kind == 'All') {
							data.tree.zone[resSpec.zone].workspace[resSpec.workspace] = role.resource.permission
						} else {
							data.tree.zone[resSpec.zone].workspace[resSpec.workspace][resSpec.kind] = role.resource.permission[resSpec.kind]
						}
					}
				}
				
			}
		}
		console.log(data.tree)
		return data
	}
}

module.exports = User