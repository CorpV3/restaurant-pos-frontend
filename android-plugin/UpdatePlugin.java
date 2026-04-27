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
import java.security.SecureRandom;
import java.security.cert.X509Certificate;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * UpdatePlugin — downloads an APK with progress feedback and fires the system install prompt.
 *
 * Uses a permissive TrustManager so old Android versions (4.x–7.x) can download from
 * modern HTTPS hosts (GitHub CDN) whose root CAs are not in the old system trust store.
 * This is acceptable for a controlled internal update flow where the URL is admin-set.
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

    /** Build an SSL context that trusts all certificates — for old Android CA store gaps. */
    private static SSLContext buildTrustAllSslContext() {
        try {
            TrustManager[] trustAll = new TrustManager[]{
                new X509TrustManager() {
                    public void checkClientTrusted(X509Certificate[] c, String a) {}
                    public void checkServerTrusted(X509Certificate[] c, String a) {}
                    public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
                }
            };
            SSLContext ctx = SSLContext.getInstance("TLS");
            ctx.init(null, trustAll, new SecureRandom());
            return ctx;
        } catch (Exception e) {
            return null;
        }
    }

    private File downloadApk(String urlStr) throws Exception {
        Log.i(TAG, "Downloading APK from: " + urlStr);

        // Follow redirects manually (GitHub releases → CDN)
        String currentUrl = urlStr;
        HttpURLConnection conn = null;
        for (int redirect = 0; redirect < 5; redirect++) {
            conn = openConnection(currentUrl);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(120000);
            conn.setInstanceFollowRedirects(false);
            conn.connect();
            int status = conn.getResponseCode();
            if (status == HttpURLConnection.HTTP_MOVED_PERM
                    || status == HttpURLConnection.HTTP_MOVED_TEMP
                    || status == 307 || status == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                currentUrl = location;
                Log.i(TAG, "Redirect → " + location);
                continue;
            }
            break;
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
        Log.i(TAG, "APK saved: " + outFile.getAbsolutePath() + " (" + downloaded + " bytes)");
        return outFile;
    }

    private HttpURLConnection openConnection(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        if (conn instanceof HttpsURLConnection) {
            SSLContext ctx = buildTrustAllSslContext();
            if (ctx != null) {
                HttpsURLConnection https = (HttpsURLConnection) conn;
                https.setSSLSocketFactory(ctx.getSocketFactory());
                https.setHostnameVerifier((hostname, session) -> true);
            }
        }
        return conn;
    }

    private void installApk(File apkFile) {
        Uri apkUri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
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
