package com.corpv3.restaurantpos;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * UpdatePlugin — downloads an APK and triggers the system install prompt.
 *
 * JS usage:
 *   import { Capacitor } from '@capacitor/core'
 *   const plugin = (window as any).Capacitor.Plugins.AppUpdater
 *   plugin.addListener('downloadProgress', ({ percent }) => ...)
 *   await plugin.downloadAndInstall({ url: 'https://...' })
 */
@CapacitorPlugin(name = "AppUpdater")
public class UpdatePlugin extends Plugin {
    private static final String TAG = "UpdatePlugin";

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }
        call.setKeepAlive(true);

        new Thread(() -> {
            try {
                File apkFile = downloadApk(url);
                installApk(apkFile);
                call.resolve();
            } catch (Exception e) {
                Log.e(TAG, "Update failed: " + e.getMessage(), e);
                call.reject("Update failed: " + e.getMessage());
            }
        }).start();
    }

    private File downloadApk(String urlStr) throws Exception {
        Log.i(TAG, "Downloading APK from: " + urlStr);
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(60000);
        conn.setInstanceFollowRedirects(true);
        // Follow HTTPS → HTTPS redirects (GitHub releases redirect to CDN)
        HttpURLConnection.setFollowRedirects(true);
        conn.connect();

        // Handle redirect manually for HTTP → HTTPS
        int status = conn.getResponseCode();
        if (status == HttpURLConnection.HTTP_MOVED_TEMP
                || status == HttpURLConnection.HTTP_MOVED_PERM
                || status == 307 || status == 308) {
            String newUrl = conn.getHeaderField("Location");
            conn.disconnect();
            conn = (HttpURLConnection) new URL(newUrl).openConnection();
            conn.connect();
        }

        long totalBytes = conn.getContentLengthLong();
        File outFile = new File(getContext().getExternalFilesDir(null), "pos_update.apk");

        InputStream is = conn.getInputStream();
        FileOutputStream fos = new FileOutputStream(outFile);
        byte[] buf = new byte[16384];
        long downloaded = 0;
        int read;
        int lastPercent = -1;

        while ((read = is.read(buf)) != -1) {
            fos.write(buf, 0, read);
            downloaded += read;
            if (totalBytes > 0) {
                int percent = (int) (downloaded * 100L / totalBytes);
                if (percent != lastPercent) {
                    lastPercent = percent;
                    JSObject ev = new JSObject();
                    ev.put("percent", percent);
                    notifyListeners("downloadProgress", ev);
                }
            }
        }

        fos.close();
        is.close();
        conn.disconnect();
        Log.i(TAG, "APK downloaded to: " + outFile.getAbsolutePath());
        return outFile;
    }

    private void installApk(File apkFile) {
        Uri apkUri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // Android 7+ requires FileProvider — direct file:// URIs are blocked
            apkUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );
        } else {
            apkUri = Uri.fromFile(apkFile);
        }

        Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
        intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        Log.i(TAG, "Install intent fired");
    }
}
