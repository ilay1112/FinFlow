package com.finflow.app;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.capgo.capacitor.sociallogin.SocialLoginPlugin;
import com.capgo.capacitor.sociallogin.ModifiedMainActivityForSocialLoginPlugin;
import com.capgo.capacitor.sociallogin.providers.google.GoogleProvider;

public class MainActivity extends BridgeActivity implements ModifiedMainActivityForSocialLoginPlugin {

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode >= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MIN && requestCode <= GoogleProvider.REQUEST_AUTHORIZE_GOOGLE_MAX) {
            SocialLoginPlugin plugin = (SocialLoginPlugin) getBridge().getPlugin("SocialLogin").getInstance();
            plugin.handleGoogleLoginIntent(requestCode, data);
        }
    }

    @Override
    public void IHaveModifiedTheMainActivityForTheUseWithSocialLoginPlugin() {
        // This is a marker method required by the plugin
    }
}
