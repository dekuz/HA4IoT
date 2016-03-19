setupController();

var uiLocalizations = [];

function getVersion(callback) {
    $.get("cache.manifest", function (data) {
        var parser = new RegExp("# Version ([0-9|.]*)", "");
        var results = parser.exec(data);

        callback(results[1]);
    });
}

function loadUILocalizations(callback) {
    $.getJSON("/app/UILocalizations.json").success(function (result) {
        uiLocalizations = result;
    }).fail(function (jqXHR, textStatus, errorThrown) {
        alert(textStatus);
    }).always(function () { callback(); });
}

function setupController() {

    var app = angular.module("app", []);
    app.controller("HomeAutomationController", [
      "$scope", "$http",
      function ($scope, $http) {
          var c = this;

          c.appConfiguration = appConfiguration;
          c.rooms = [];

          c.weatherStation = {};
          c.sensors = [];
          c.rollerShutters = [];
          c.motionDetectors = [];
          c.windows = [];

          c.activeRoom = "";
          c.errorMessage = null;
          c.version = "-";

          getVersion(function (version) {
              c.version = version;
          });

          c.getUILocalization = function (key) {
              return getUILocalization(key);
          };

          c.generateRooms = function () {

              $http.get("/api/configuration").success(function (data) {

                  $.each(data.Areas, function (areaId, area) {
                      if (area.Settings.AppSettings.Hide) {
                          return true;
                      }

                      var areaControl = {
                          id: areaId,
                          caption: getConfigurationValue(area, "Caption", areaId),
                          sortValue: getConfigurationValue(area, "SortValue", 0),
                          actuators: [],
                          automations: [],
                          onStateCount: 0 };
                      
                      $.each(area.Actuators, function (actuatorId, actuator) {
                          actuator.id = actuatorId;
                          configureActuator(area, actuator);
                          
                          if (actuator.hide) {
                              return true;
                          }

                          if (actuator.Type === "HA4IoT.Actuators.TemperatureSensor" ||
                              actuator.Type === "HA4IoT.Actuators.HumiditySensor") {
                              c.sensors.push(actuator);
                          } else if (actuator.Type === "HA4IoT.Actuators.RollerShutter") {
                              c.rollerShutters.push(actuator);
                          } else if (actuator.Type === "HA4IoT.Actuators.MotionDetector") {
                              c.motionDetectors.push(actuator);
                          } else if (actuator.Type === "HA4IoT.Actuators.Window") {
                              c.windows.push(actuator);
                          }

                          areaControl.actuators.push(actuator);
                      });

                      c.rooms.push(areaControl);
                  });

                  if (c.sensors.length === 0) {
                      c.appConfiguration.showSensorsOverview = false;
                  }

                  if (c.rollerShutters.length === 0) {
                      c.appConfiguration.showRollerShuttersOverview = false;
                  }

                  if (c.motionDetectors.length === 0) {
                      c.appConfiguration.showMotionDetectorsOverview = false;
                  }

                  if (c.windows.length === 0) {
                      c.appConfiguration.showWindowsOverview = false;
                  }

                  if (c.rooms.length === 1) {
                      c.setActivePanel(c.rooms[0].id);
                  }

                  c.pollStatus();
                  c.isReady = true;

                  $("#content").removeClass("hidden");
                  $("body").css("background", "white");
              });
          };

          c.setActivePanel = function (id) {
              if (c.activePanel === id) {
                  c.activePanel = "";
              } else {
                  c.activePanel = id;
              }

              setTimeout(function () {
                  $("html, body").animate({
                      scrollTop: $("#" + id).offset().top
                  }, 250);
              }, 100);
          }

          c.previousHash = "";
          c.pollStatus = function () {
              $.ajax({ method: "GET", url: "/api/status", timeout: 2500 }).done(function (data) {
                  c.errorMessage = null;

                  if (data.Meta.Hash === c.previousHash) {
                      return;
                  }

                  c.previousHash = data.Meta.Hash;
                  console.log("Updating UI due to state changes");

                  $.each(data.Actuators, function (id, state) {
                      c.updateStatus(id, state);
                  });

                  updateOnStateCounters(c.rooms);

                  c.weatherStation = data.WeatherStation;

                  $scope.$apply(function () { $scope.msgs = data; });
              }).fail(function (jqXHR, textStatus, errorThrown) {
                  c.errorMessage = textStatus;
              }).always(function () {
                  setTimeout(function () { c.pollStatus(); }, c.appConfiguration.pollInterval);
              });
          };

          $scope.toggleState = function (actuator) {
              var newState = "On";
              if (actuator.state.state === "On") {
                  newState = "Off";
              }

              invokeActuator(actuator.id, { state: newState }, function () { actuator.state.state = newState; });
          };

          $scope.invokeVirtualButton = function (actuator) {
              invokeActuator(actuator.id, {});
              c.pollStatus();
          }

          $scope.invokeVirtualButtonGroup = function (actuator, button) {
              invokeActuator(actuator, { button: button });
              c.pollStatus();
          }

          $scope.toggleIsEnabled = function (actuator) {
              var newState = !actuator.state.IsEnabled;

              updateActuatorSettings(actuator.id, {
                  IsEnabled: newState
              }, function () {
                  actuator.state.IsEnabled = newState;
              });
          };

          $scope.setState = function (actuator, newState) {
              invokeActuator(actuator.id, {
                  state: newState
              }, function () {
                  actuator.state.state = newState;
              });
          };

          c.updateStatus = function (id, state) {
              $.each(c.rooms, function (i, room) {
                  $.each(room.actuators, function (i, actuator) {

                      if (actuator.id === id) {
                          actuator.state = state;
                      }

                      return;
                  });
              });
          };

          loadUILocalizations(function () { c.generateRooms(); });
      }
    ]);
}

function configureActuator(room, actuator) {
    actuator.sortValue = getConfigurationValue(actuator, "SortValue", 0);
    actuator.image = getConfigurationValue(actuator, "Image", "DefaultActuator");
    actuator.caption = getConfigurationValue(actuator, "Caption", actuator.id);
    actuator.overviewCaption = getConfigurationValue(actuator, "OverviewCaption", actuator.id);
    actuator.hide = getConfigurationValue(actuator, "Hide", false);
    actuator.displayVertical = getConfigurationValue(actuator, "DisplayVertical", false);
    actuator.isPartOfOnStateCounter = getConfigurationValue(actuator, "IsPartOfOnStateCounter", false);
    actuator.onStateId = getConfigurationValue(actuator, "OnStateId", "On");

    actuator.state = {};

    switch (actuator.Type) {
        case "HA4IoT.Actuators.Lamp":
            {
                actuator.template = "Views/ToggleTemplate.html";
                break;
            }
        case "HA4IoT.Actuators.Socket":
            {
                actuator.template = "Views/ToggleTemplate.html";
                break;
            }

        case "HA4IoT.Actuators.RollerShutter":
            {
                actuator.template = "Views/RollerShutterTemplate.html";
                break;
            }

        case "HA4IoT.Actuators.Window":
            {
                actuator.template = "Views/WindowTemplate.html";
                break;
            }

        case "HA4IoT.Actuators.StateMachine":
            {
                actuator.template = "Views/StateMachineTemplate.html";
                
                var extendedStates = [];
                $.each(actuator.states, function (i, state) {
                    var key = "Caption." + state;
                    var stateCaption = getConfigurationValue(actuator, key, key);

                    extendedStates.push({ value: state, caption: stateCaption });
                });

                actuator.states = extendedStates;
                break;
            }

        case "HA4IoT.Actuators.TemperatureSensor":
            {
                actuator.template = "Views/TemperatureSensorTemplate.html";
                break;
            }

        case "HA4IoT.Actuators.HumiditySensor":
            {
                actuator.template = "Views/HumiditySensorTemplate.html";
                actuator.dangerValue = getConfigurationValue(actuator, "DangerValue", 70);
                actuator.warningValue = getConfigurationValue(actuator, "WarningValue", 60);
                break;
            }

        case "HA4IoT.Actuators.MotionDetector":
            {
                actuator.template = "Views/MotionDetectorTemplate.html";
                break;
            }

        case "HA4IoT.Actuators.VirtualButton":
            {
                actuator.template = "Views/VirtualButtonTemplate.html";
                break;
            }

        case "HA4IoT.Actuators.VirtualButtonGroup":
            {
                actuator.template = "Views/VirtualButtonGroupTemplate.html";
                
                var extendedButtons = [];
                $.each(actuator.buttons, function (i, button) {
                    var key = "Caption." + button;
                    var buttonCaption = getConfigurationValue(actuator, key, key);
                    
                    extendedButtons.push({ id: button, caption: buttonCaption });
                });

                actuator.buttons = extendedButtons;
                break;
            }

        default:
            {
                actuator.hide = true;
                return;
            }
    }
    
    appConfiguration.actuatorExtender(actuator);
}

function getConfigurationValue(component, name, defaultValue) {
    if (component.Settings.AppSettings === undefined) {
        return defaultValue;
    }

    if (component.Settings.AppSettings[name] === undefined) {
        return defaultValue;
    }

    return component.Settings.AppSettings[name];
}

function updateOnStateCounters(areas) {
    areas.forEach(function (area) {
        var count = 0;

        area.actuators.forEach(function (actuator) {
            if (actuator.isPartOfOnStateCounter) {
                if (actuator.onStateId === actuator.state.state) {
                    count++;
                }
            }
        });

        area.onStateCount = count;
    });
}


function invokeActuator(id, request, successCallback) {
    // This hack is required for Safari because only one Ajax request at the same time is allowed.
    var url = "/api/actuator/" + id + "/status?body=" + JSON.stringify(request);

    $.ajax({
        method: "POST",
        url: url,
        contentType: "application/json; charset=utf-8",
        timeout: 2500
    }).done(function () {
        if (successCallback != null) {
            successCallback();
        }
    }).fail(function (jqXHR, textStatus, errorThrown) {
        alert(textStatus);
    });
}

function updateActuatorSettings(id, request, successCallback) {
    // This hack is required for Safari because only one Ajax request at the same time is allowed.
    var url = "/api/actuator/" + id + "/settings?body=" + JSON.stringify(request);

    $.ajax({
        method: "POST",
        url: url,
        contentType: "application/json; charset=utf-8",
        timeout: 2500
    }).done(function () {
        if (successCallback != null) {
            successCallback();
        }
    }).fail(function (jqXHR, textStatus, errorThrown) {
        alert(textStatus);
    });
}
