package com.corpv3.restaurantpos;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.sumup.merchant.api.SumUpAPI;
import com.sumup.merchant.api.SumUpPayment;
import com.sumup.merchant.api.SumUpState;
import java.math.BigDecimal;

@CapacitorPlugin(name = "SumUp")
public class SumUpPlugin extends Plugin {

    private static final int CHECKOUT_REQUEST_CODE = 2001;

    @PluginMethod
    public void init(PluginCall call) {
        String apiKey = call.getString("apiKey");
        if (apiKey == null || apiKey.isEmpty()) {
            call.reject("apiKey is required");
            return;
        }
        SumUpState.init(apiKey);
        call.resolve();
    }

    @PluginMethod
    public void checkout(PluginCall call) {
        Double amount = call.getDouble("amount");
        String currency = call.getString("currency", "GBP");
        String title = call.getString("title", "Payment");

        if (amount == null || amount <= 0) {
            call.reject("Valid amount is required");
            return;
        }

        saveCall(call);

        SumUpPayment payment = SumUpPayment.builder()
            .total(new BigDecimal(String.valueOf(amount)))
            .currency(SumUpPayment.Currency.valueOf(currency.toUpperCase()))
            .title(title)
            .build();

        SumUpAPI.checkout(getActivity(), payment, CHECKOUT_REQUEST_CODE);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode != CHECKOUT_REQUEST_CODE) return;

        PluginCall savedCall = getSavedCall();
        if (savedCall == null) return;

        JSObject ret = new JSObject();

        if (data != null) {
            int result = data.getIntExtra(SumUpAPI.Response.RESULT_CODE, -1);
            boolean approved = (result == SumUpAPI.Response.ResultCode.TRANSACTION_SUCCESSFUL);
            String txCode = data.getStringExtra(SumUpAPI.Response.TX_CODE);

            ret.put("approved", approved);
            ret.put("transactionCode", txCode != null ? txCode : "");
            ret.put("resultCode", result);

            if (approved) {
                savedCall.resolve(ret);
            } else {
                savedCall.reject("Payment declined or cancelled", null, null, ret);
            }
        } else {
            ret.put("approved", false);
            ret.put("transactionCode", "");
            savedCall.reject("Payment cancelled", null, null, ret);
        }
    }
}
