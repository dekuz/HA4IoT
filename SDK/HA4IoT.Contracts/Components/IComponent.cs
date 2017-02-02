﻿using System;
using System.Collections.Generic;
using HA4IoT.Contracts.Api;
using Newtonsoft.Json.Linq;

namespace HA4IoT.Contracts.Components
{
    public interface IComponent
    {
        event EventHandler<ComponentFeatureStateChangedEventArgs> StateChanged;

        ComponentId Id { get; }

        ComponentFeatureStateCollection GetState();

        ComponentFeatureCollection GetFeatures();

        #region OLD
        IList<GenericComponentState> GetSupportedStates(); // TODO: Consider "SupportedComponentState" class
        void HandleApiCall(IApiContext apiContext);
        JToken ExportConfiguration();
        JToken ExportStatus();
        #endregion
    }
}
