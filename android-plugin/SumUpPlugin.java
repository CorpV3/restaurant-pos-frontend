package com.corpv3.restaurantpos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * SumUp plugin stub — compiles without the SumUp SDK AAR.
 * Returns SUMUP_SDK_UNAVAILABLE so the JS layer falls back to
 * hosted-checkout QR flow. Replace with the real implementation
 * once SumUpSDK.aar is available in android/app/libs/.
 */
@CapacitorPlugin(name = "SumUp")
public class SumUpPlugin extends Plugin {

    @PluginMethod
    public void init(PluginCall call) {
        call.reject("SUMUP_SDK_UNAVAILABLE");
    }

    @PluginMethod
    public void checkout(PluginCall call) {
        call.reject("SUMUP_SDK_UNAVAILABLE");
    }
}
