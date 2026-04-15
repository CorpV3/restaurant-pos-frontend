package com.corpv3.restaurantpos;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.sumup.merchant.reader.api.SumUpAPI;
import com.sumup.merchant.reader.api.SumUpLogin;
import com.sumup.merchant.reader.api.SumUpPayment;
import java.math.BigDecimal;

/**
 * SumUp native payment plugin (SDK v7).
 *
 * Flow:
 *   1. Call init({ apiKey: "<affiliate-key>" }) once on app start.
 *      If not already logged in, opens SumUp login screen for merchant.
 *   2. Call checkout({ amount, currency, title }) per transaction.
 *      The SumUp payment screen opens — customer taps their card on the
 *      back of this phone (NFC / Tap to Pay) or on a paired card reader.
 *
 * Affiliate key: register at https://me.sumup.com/developers
 * with package name com.corpv3.restaurantpos to get your UUID key.
 */
@CapacitorPlugin(name = "SumUp")
public class SumUpPlugin extends Plugin {

    private static final int LOGIN_REQUEST_CODE   = 2000;
    private static final int CHECKOUT_REQUEST_CODE = 2001;

    @PluginMethod
    public void init(PluginCall call) {
        String affiliateKey = call.getString("apiKey");
        if (affiliateKey == null || affiliateKey.isEmpty()) {
            call.reject("apiKey (affiliate key) is required");
            return;
        }

        // Already logged in — nothing to do
        if (SumUpAPI.isLoggedIn()) {
            call.resolve();
            return;
        }

        // Open the SumUp merchant login screen (once per session/install)
        saveCall(call);
        SumUpLogin login = SumUpLogin.builder(affiliateKey).build();
        SumUpAPI.openLoginActivity(getActivity(), login, LOGIN_REQUEST_CODE);
    }

    @PluginMethod
    public void checkout(PluginCall call) {
        Double amount = call.getDouble("amount");
        String currency = call.getString("currency", "GBP");
        String title   = call.getString("title", "Payment");

        if (amount == null || amount <= 0) {
            call.reject("A valid amount is required");
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

        PluginCall savedCall = getSavedCall();
        if (savedCall == null) return;

        if (requestCode == LOGIN_REQUEST_CODE) {
            if (SumUpAPI.isLoggedIn()) {
                savedCall.resolve();
            } else {
                savedCall.reject("SumUp login failed or was cancelled");
            }
            return;
        }

        if (requestCode == CHECKOUT_REQUEST_CODE) {
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
                JSObject ret2 = new JSObject();
                ret2.put("approved", false);
                ret2.put("transactionCode", "");
                savedCall.reject("Payment cancelled", null, null, ret2);
            }
        }
    }
}
