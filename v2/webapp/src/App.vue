<template>
  <v-app id="inspire">
    <!-- Sidebar -->
    <v-navigation-drawer right floating class="elevation-6 mainbackground lighten-1" v-model="drawer" app v-if="$store.state.user.auth == true && $store.state.ui.hideNavbarAndSidebar == false" :mini-variant="true" align="center" justify="center">
      <v-list
        dense
        nav
      >        
        <v-list-item link v-on:click="$router.push('/')">
          <v-tooltip left>
            <template v-slot:activator="{ on, attrs }">
              <v-list-item-icon>
                <v-tooltip bottom>
                  <template v-slot:activator="{ on, attrs }">
                    <v-icon v-bind="attrs" v-on="on" color="primary" v-if="$route.path == '/'">fab fa-flipboard</v-icon>
                    <v-icon v-bind="attrs" v-on="on" color="grey" v-else>fab fa-flipboard</v-icon>
                  </template>
                  <span>Control panel</span>
                </v-tooltip>

              </v-list-item-icon>
              <v-list-item-content v-on:click="$router.push('/')">
                <v-list-item-title>Control panel</v-list-item-title>
              </v-list-item-content>
            </template>
            <span>Control panel</span>
          </v-tooltip>
        </v-list-item>

        <v-list-item v-if="listOfResourceToDisplay.length !== 0"
          v-for="resource in listOfResourceToDisplay"
          :key="resource"
          link
          v-on:click="goToResource(resource)"
        >
          <v-tooltip left>
            <template v-slot:activator="{ on, attrs }">
              <v-list-item-icon>
                <v-tooltip bottom>
                  <template v-slot:activator="{ on, attrs }">
                    <v-icon v-bind="attrs" v-on="on" color="primary" v-if="$route.path.split('/')[2] == resource">{{iconForResource(resource)}}</v-icon>
                    <v-icon v-bind="attrs" v-on="on" color="grey" v-else>{{iconForResource(resource)}}</v-icon>
                  </template>
                  <span>{{resource}}</span>
                </v-tooltip>

              </v-list-item-icon>
              <v-list-item-content v-on:click="goToResource(resource)">
                <v-list-item-title>{{ resource }}</v-list-item-title>
              </v-list-item-content>
            </template>
            <span>{{resource}}</span>
          </v-tooltip>
        </v-list-item>
      </v-list>

      <template v-slot:append>
        <div class="pa-2">
          <v-btn icon v-on:click="logout">
            <v-icon>mdi-logout</v-icon>
          </v-btn>
        </div>
      </template>
    </v-navigation-drawer>
    
    <!-- APP BAR DESK -->
    <v-app-bar dense app v-if="$store.state.user.auth == true && $store.state.ui.hideNavbarAndSidebar == false && $store.state.ui.isMobile == false" class="elevation-4">
      <v-toolbar-title v-if="$route.params.name == undefined || $vuetify.breakpoint.mobile == false" style="cursor: pointer" v-on:click="$router.push('/')"><h1 style="font-size: 32px !important;" class="dora-font"> Dora </h1></v-toolbar-title>
    <v-spacer />
    <!-- Credits -->
    <div v-if="credits !== null"  @ref="credits.weekly" :class="credits.outOfCredit == true ? 'error--text' : '' ">
      <v-divider
        class="mx-4"
        vertical
      ></v-divider>     
      <b >{{Math.round(parseFloat(credits.weekly) * 10) / 10}} / {{$store.state.user.credits[$store.state.selectedZone]}}  C</b>
      <v-divider
        class="mx-4"
        vertical
      ></v-divider>       
    </div>     
        <div>      
          <v-menu
            bottom
            right            
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                dark
                icon
                v-bind="attrs"
                v-on="on"
                class="green--text"
              >
                <v-icon>fas fa-globe-europe</v-icon>                
              </v-btn>
            </template>
            <v-list>
              <v-list-item
                v-for="(item, i) in zones"
                :key="i"
                @click="zone = item"
              >
                <v-list-item-title v-if="item == zone"><b>{{ item }}</b></v-list-item-title>
                <v-list-item-title v-else>{{ item }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <b v-if="$vuetify.breakpoint.mobile == false">{{zone}}</b>
        </div>

          <!-- WORKSPACE -->
        <div> 
          <v-menu
            bottom
            right            
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                dark
                icon
                v-bind="attrs"
                v-on="on"
                class="teal--text pl-4"
              >
                <v-icon>fa-layer-group</v-icon>                
              </v-btn>
            </template>

            <v-list style="max-height: 70vh" class="overflow-y-auto">
              <v-list-item
                v-for="(item, i) in workspaces"
                :key="i"
                @click="workspace = item"
              >
                <v-list-item-title v-if="item == workspace"><b>{{ item }}</b></v-list-item-title>
                <v-list-item-title v-else>{{ item }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <b v-show="$vuetify.breakpoint.mobile == false" class="pl-2">{{workspace}}</b>
        </div>

      
      <v-btn icon @click="showCloneWorkspaceDialog = true"><v-icon small> fas fa-copy </v-icon></v-btn>
      
      <v-divider
        class="mx-4"
        vertical
      ></v-divider>   
      <div v-if="$vuetify.breakpoint.mobile == false">
        <v-btn text v-on:click="$router.push('/')">
          <v-tooltip bottom>
            <template v-slot:activator="{ on, attrs }">
                <v-icon v-bind="attrs" v-on="on"  class="blue--text" v-if="$route.path == '/'">fab fa-flipboard</v-icon>
                <v-icon v-bind="attrs" v-on="on"  v-else>fab fa-flipboard</v-icon>
            </template>
            <span>Control panel</span>
          </v-tooltip>
        </v-btn>
        
        <v-btn text v-for="resource in listOfResourceToDisplayForToolbar" v-bind:key="resource" v-on:click="goToResource(resource)">
          <v-tooltip bottom>
            <template v-slot:activator="{ on, attrs }">
              <v-icon class="blue--text" v-bind="attrs" v-on="on" v-if="'/resource/' + resource == $route.path">{{iconForResource(resource)}}</v-icon>
              <v-icon v-bind="attrs" v-on="on" v-else>{{iconForResource(resource)}}</v-icon>
            </template>
            <span>{{resource}}</span>
          </v-tooltip>
        </v-btn>
        </div> 
      <ThemeChanger :show="false"/>
      <v-btn icon v-on:click="openUserPreference = true" v-if="$vuetify.breakpoint.mobile == false">
        <v-icon>fas fa-user</v-icon>
      </v-btn>
      <v-app-bar-nav-icon color="grey" @click="drawer = !drawer" ></v-app-bar-nav-icon>
    </v-app-bar>


    <!-- MOBILE NAVBAR -->
    <v-app-bar dense app v-if="$store.state.user.auth == true && $store.state.ui.hideNavbarAndSidebar == false && $store.state.ui.isMobile == true" class="elevation-4">
      <v-app-bar-nav-icon @click="drawer = !drawer" ></v-app-bar-nav-icon>
      <v-toolbar-title><h1 class="dora-font" style="font-size: 24px !important;"> Dora </h1></v-toolbar-title>      

      <v-spacer />
    <!-- Credits -->
      <div v-if="credits !== null"  @ref="credits.weekly" :class="credits.outOfCredit == true ? 'error--text' : '' ">
        <v-divider
          class="mx-4"
          vertical
        ></v-divider>     
        <b style="font-size: 10px">{{Math.round(parseFloat(credits.weekly) * 10) / 10}} / {{$store.state.user.credits[$store.state.selectedZone]}}  C</b>
        <v-divider
          class="mx-4"
          vertical
        ></v-divider>       
      </div>     
          <v-menu
            bottom
            right            
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                dark
                icon
                v-bind="attrs"
                v-on="on"
                class="green--text"
              >
                <v-icon>fas fa-globe-europe</v-icon>                
              </v-btn>
            </template>
            <v-list>
              <v-list-item
                v-for="(item, i) in zones"
                :key="i"
                @click="zone = item"
              >
                <v-list-item-title v-if="item == zone"><b>{{ item }}</b></v-list-item-title>
                <v-list-item-title v-else>{{ item }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>

          <!-- WORKSPACE -->
          <v-menu
            bottom
            right  
            attach
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                dark
                icon
                v-bind="attrs"
                v-on="on"
                class="teal--text"
              >
                <v-icon>fa-layer-group</v-icon>                
              </v-btn>
            </template>

            <v-list style="max-height: 70vh" class="overflow-y-auto">
              <v-list-item
                v-for="(item, i) in workspaces"
                :key="i"
                @click="workspace = item"
              >
                <v-list-item-title v-if="item == workspace"><b>{{ item }}</b></v-list-item-title>
                <v-list-item-title v-else>{{ item }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <ThemeChanger :show="false"/>
        <v-btn icon v-on:click="logout">
          <v-icon>mdi-logout</v-icon>
        </v-btn>
    </v-app-bar>

    <v-main class="mainbackground backgrounduser"  :style="'background-image: url(' + backgroundImage + ')'">
        <router-view ></router-view>
            <v-fab-transition>
              <v-btn v-if="$store.state.user.auth == true && $route.path.includes('shell') == false"
                color="primary"
                dark
                absolute
                bottom
                right
                fab
                small
                style="margin-bottom: 35px"
                v-on:click="newResourceDialog = true"
              >
                <v-icon>far fa-file-alt</v-icon>
              </v-btn>        
            </v-fab-transition>
    </v-main>
    
    <!-- Dialogs -->
    <v-dialog v-model="$store.state.apiResponse.dialog" width="50vw">
      <v-card class="elevation-12">
        <v-toolbar dense
          :color="$store.state.apiResponse.type == 'Error' ? 'red' : 'green darken-2'" dark flat>
          <v-toolbar-title class="overline">API Response</v-toolbar-title>
          <v-spacer></v-spacer>
        </v-toolbar>
        <v-card-text v-if="$store.state.apiResponse.text !== null && $store.state.apiResponse.text.toLowerCase() !== 'service temporarily unavailable'">
          <h3 class="pt-4 mx-lg-auto">{{$store.state.apiResponse.text}}</h3>
        </v-card-text>
        <v-card-text v-else>
          <h3 class="pt-4 mx-lg-auto">Updating API server...</h3>
        </v-card-text>        
      </v-card>
    </v-dialog>

    <v-dialog v-model="showCloneWorkspaceDialog" width="50vw">
      <v-card v-if="showCloneWorkspaceDialog">
        <v-card-title>Add new Workspace </v-card-title>
        <v-card-subtitle>The new workspace and his permission will be cloned from the current workspace</v-card-subtitle> 
        <v-card-text>
          <p> You will be able to use the volumes defined in this workspace </p>
          <v-text-field outlined placeholder="New workspace name" v-model="newWorkspaceName"> </v-text-field>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="cloneWorkspace">Add</v-btn>
        </v-card-actions>

      </v-card>
    </v-dialog>

    <v-dialog fullscreen v-model="openUserPreference">
      <UserEditor :keyuser="userDialogKey" v-on:close-dialog="openUserPreference = false"  v-if="openUserPreference"></UserEditor>
    </v-dialog>

    <v-dialog max-width="600px" v-model="newResourceDialog">
      <EditResourceAsYaml v-if="newResourceDialog == true"/>
    </v-dialog>

    <cookie-law theme="blood-orange">
      <div slot="message">
        © 2021 ProM Facility. This site use technical cookies in order to preserve user preferences and authorizations.
      </div>
    </cookie-law>
  </v-app>
</template>

<script>
  import Vue from 'vue'
  import NewResource from '@/components/NewResource.vue'
  import CreateResource from '@/components/CreateResource.vue'
  import EditResourceAsYaml from '@/components/EditResourceAsYaml.vue'
  import ThemeChanger from '@/components/ThemeChanger.vue'
  import UserEditor from '@/components/UserEditor.vue'
  import CookieLaw from 'vue-cookie-law'

  export default {
    data: () => ({ 
      tabResource: 1,
      navDrawKey: 1,
      drawer: false,
      expander: true,
      newResourceDialog: false,
      workspaces: [],
      zones: [],
      zone: '',
      workspace: '',
      groups: [],
      userTree: {},
      listOfResourceToDisplay: [],
      listOfResourceToDisplayForToolbar: [],
      listOfResourceToDisplayForMenu: [],
      credits: null,
      openUserPreference: false,
      userDialogKey: 0,

      showCloneWorkspaceDialog: false,
      newWorkspaceName: '',
      creditInterval: undefined
    }),
    components: {NewResource, CreateResource, EditResourceAsYaml, CookieLaw, ThemeChanger, UserEditor},
    watch: {
      '$vuetify.breakpoint.width' (to, from) {
        if (to <= 760) {
          this.$store.commit('isMobile', true)
        } else {
          this.$store.commit('isMobile', false)
        }
      },
      '$store.state.groupCallIndex' (to, from) {
        this.getListOfResourceToDisplay()
      },
      workspace (to, from) {
        this.$store.commit('selectedWorkspace', to)
        this.getListOfResourceToDisplay()
      },
      zone (to, from) {
        this.$store.commit('selectedZone', to)
        this.getListOfResourceToDisplay()
      },
      '$store.state.user.auth' (to, from) {
        if (to == true) {
          this.checkCreditsFn()
        }
      }
    },
    computed: {
      backgroundImage () {
        let imageWorkspace = Vue.prototype.$cookie.get('dora.background.image.' + this.$store.state.selectedWorkspace)
        if (imageWorkspace !== null && imageWorkspace !== '') {
          return imageWorkspace
        } else {
          return Vue.prototype.$cookie.get('dora.background.image')  
        }
      }  
    },
    methods: {
      cloneWorkspace () {
        this.$store.dispatch('cloneWorkspace', {
          name: this.newWorkspaceName,
          cb: function () {
            this.newWorkspaceName = ''
            this.showCloneWorkspaceDialog = false
            this.$store.dispatch('groups', {cb: () => {}})
          }.bind(this)
        })
      },
      checkCreditsFn () {
        if (this.$store.state.user.auth == true) {
          this.$store.dispatch('userCredits', function (data) {
            if (typeof data == 'object') {
              this.credits = data  
            } else {
              this.credits = null
            }
          }.bind(this))
        }
      },
      checkCredits () {
        setTimeout(function () {
          if (this.creditInterval == undefined) {
            this.checkCreditsFn()
            this.creditInterval = setInterval(function () {
              this.checkCreditsFn()
            }.bind(this), 30000) 
          }
        }.bind(this), 500)
      },
      getListOfResourceToDisplay () {
        this.workspace = this.$store.state.selectedWorkspace
        this.userTree = this.$store.state.user.tree
        let currentZone = this.$store.state.selectedZone
        let currentWorkspace = this.$store.state.selectedWorkspace
        if (this.userTree == undefined) {
          return
        }
        if (Object.keys(this.userTree.zone).length == 1 && this.userTree.zone['All'] !== undefined) {
          currentZone = 'All'
        }
        this.workspaces = Object.keys(this.userTree.zone[currentZone].workspace)
        if (this.workspaces.includes('admin')) {
          this.workspaces.push('All')  
        }
        
        this.zones = Object.keys(this.userTree.zone)
        if (!this.zones.includes(this.$store.state.selectedZone)) {
          this.zones.push(this.$store.state.selectedZone)
        }
        if (!this.zones.includes(this.$store.state.defaultZone)) {
          this.zones.push(this.$store.state.defaultZone)
        }        
        this.zone = this.$store.state.selectedZone
        let listOfRes = this.userTree.zone[currentZone].workspace[currentWorkspace]
        let listOfResourceToDisplay = []
        Object.keys(listOfRes).forEach(function (resourceKind) {
          if (listOfRes[resourceKind].includes('Get') && resourceKind !== 'Token' && resourceKind !== 'Project') {
            listOfResourceToDisplay.push(resourceKind)
          }
        }.bind(this))
        this.listOfResourceToDisplay = Array.from((new Set(listOfResourceToDisplay)).values())
        let toToolbar = ['GPU', 'Workload', 'Container']
        let toMenu = ['Node', 'Storage', 'GPU', 'CPU', 'Zone', 'Role', 'Volume', 'Usercredit']
        this.listOfResourceToDisplayForToolbar = this.listOfResourceToDisplay.filter((l) => {
          return toToolbar.includes(l)
        })
        this.listOfResourceToDisplayForMenu = this.listOfResourceToDisplay.filter((l) => {
          return toMenu.includes(l)
        })        
      },
      iconForResource (resource) {
        let icons = {
          'Workload': 'fa-box',
          'Container': 'fab fa-docker',
          'Role': 'fas fa-user-tag',
          'Storage': 'fa-database',
          'Volume': 'fa-hdd',
          'Node': 'fa-server',
          'Group': 'fa-layer-group',
          'Workspace': 'fa-layer-group',
          'User': 'fa-users',
          'CPU': 'fa-microchip',
          'GPU': 'fa-brain',
          'Zone': 'fa-list-ol',
          'Resourcecredit': 'fas fa-hand-holding-usd',
          'Usercredit': 'fas fa-credit-card'
        }
        return icons[resource]
      },
      logout () {
        this.$store.dispatch('logout')
      },
      goToResource (name) {
        this.$router.push('/resource/' + name)
      }
    },
    mounted () {
      var userAgent = navigator.userAgent.toLowerCase()
      if (userAgent.indexOf(' electron/') > -1) {
        this.$store.commit('setIsElectron', true)
      }     
      this.checkCredits()
    },
    created () {
      var userAgent = navigator.userAgent.toLowerCase()
      if (userAgent.indexOf(' electron/') > -1) {
        this.$store.commit('setIsElectron', true)
      }
      navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for (let registration of registrations) {
          registration.unregister()
        } 
      })
      if (screen.width <= 760) {
        this.$store.commit('isMobile', true)
      }
      this.getListOfResourceToDisplay()
    },
    beforeDestroy () {
      if (this.creditInterval !== undefined) {
        clearInterval(this.creditInterval)
        this.creditInterval = undefined 
      }
    }
  }
</script>
<style>
@import url('https://fonts.googleapis.com/css2?family=Lobster&display=swap');
.dora-font {
  font-family: 'Lobster', cursive;
}
.v-expansion-panel-content__wrap {
  padding: 0px;
}
.v-btn--example {
  bottom: 15px;
  position: absolute;
  right: 15px;
}
.backimage {
  background: #121212;  
  background: -webkit-linear-gradient(to bottom, #121212, #171717);
  background: linear-gradient(to bottom, #121212, #171717); 
}
.backgrounduser {   
  background-size: cover;
  min-height: 95vh;
}
</style>