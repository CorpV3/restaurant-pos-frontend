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

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.PrintWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

@CapacitorPlugin(name = "AppUpdater")
public class UpdatePlugin extends Plugin {
    private static final String TAG = "UpdatePlugin";
    private static final String LOG_FILE = "update_log.txt";

    // ── File-based logger (survives app crashes) ──────────────────────────────

    private void flog(String level, String msg) {
        // 1. Write to file (persists through crash)
        try {
            File logFile = new File(getContext().getFilesDir(), LOG_FILE);
            String ts = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(new Date());
            String line = "[" + ts + "] [" + level + "] " + msg + "\n";
            try (FileWriter fw = new FileWriter(logFile, true)) {
                fw.write(line);
            }
        } catch (Exception ignored) {}
        // 2. Fire event to JS Logs tab (real-time, visible without crash)
        try {
            JSObject ev = new JSObject();
            ev.put("level", level);
            ev.put("msg", msg);
            notifyListeners("updateLog", ev);
        } catch (Exception ignored) {}
        Log.i(TAG, "[" + level + "] " + msg);
    }

    private void flogE(String msg, Throwable t) { // Throwable catches both Exception and Error
        String full = msg + " — " + t.getClass().getSimpleName() + ": " + t.getMessage();
        flog("ERROR", full);
        // Also append stack trace to file
        try {
            File logFile = new File(getContext().getFilesDir(), LOG_FILE);
            try (FileWriter fw = new FileWriter(logFile, true);
                 PrintWriter pw = new PrintWriter(fw)) {
                t.printStackTrace(pw);
            }
        } catch (Exception ignored) {}
        Log.e(TAG, msg, t);
    }

    /** Read the persistent update log and return it to JS. */
    @PluginMethod
    public void readUpdateLog(PluginCall call) {
        try {
            File logFile = new File(getContext().getFilesDir(), LOG_FILE);
            if (!logFile.exists()) {
                JSObject ret = new JSObject();
                ret.put("log", "(no update log found)");
                call.resolve(ret);
                return;
            }
            StringBuilder sb = new StringBuilder();
            try (BufferedReader br = new BufferedReader(new InputStreamReader(
                    new java.io.FileInputStream(logFile)))) {
                String line;
                while ((line = br.readLine()) != null) {
                    sb.append(line).append("\n");
                }
            }
            JSObject ret = new JSObject();
            ret.put("log", sb.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not read log: " + e.getMessage());
        }
    }

    /** Clear the persistent update log. */
    @PluginMethod
    public void clearUpdateLog(PluginCall call) {
        try {
            File logFile = new File(getContext().getFilesDir(), LOG_FILE);
            if (logFile.exists()) logFile.delete();
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not clear log: " + e.getMessage());
        }
    }

    // ── Main download-and-install flow ────────────────────────────────────────

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("URL is required");
            return;
        }
        call.setKeepAlive(true);

        // Clear previous log at the start of each attempt
        try {
            File logFile = new File(getContext().getFilesDir(), LOG_FILE);
            if (logFile.exists()) logFile.delete();
        } catch (Exception ignored) {}

        flog("INFO", "=== Update started ===");
        flog("INFO", "URL: " + url);
        flog("INFO", "Android SDK: " + Build.VERSION.SDK_INT + " (" + Build.VERSION.RELEASE + ")");
        flog("INFO", "Device: " + Build.MANUFACTURER + " " + Build.MODEL);

        new Thread(() -> {
            try {
                File apkFile = downloadApk(url);
                installApk(apkFile, call);
            } catch (Throwable e) {
                flogE("Update failed", e);
                call.reject("Update failed: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            }
        }).start();
    }

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
        flog("INFO", "Starting download: " + urlStr);

        String currentUrl = urlStr;
        HttpURLConnection conn = null;
        for (int redirect = 0; redirect < 5; redirect++) {
            flog("INFO", "Connecting to: " + currentUrl);
            conn = openConnection(currentUrl);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(120000);
            conn.setInstanceFollowRedirects(false);
            conn.connect();
            int status = conn.getResponseCode();
            flog("INFO", "HTTP status: " + status);
            if (status == HttpURLConnection.HTTP_MOVED_PERM
                    || status == HttpURLConnection.HTTP_MOVED_TEMP
                    || status == 307 || status == 308) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null) break;
                currentUrl = location;
                flog("INFO", "Redirect → " + location);
                continue;
            }
            break;
        }

        if (conn == null) throw new Exception("Failed to open connection");

        long totalBytes = conn.getContentLength(); // getContentLengthLong() is API 24+, use int version for old Android
        flog("INFO", "Content-Length: " + totalBytes + " bytes");

        // Always use internal files dir — no permission needed, always writable.
        // FileProvider grants the package installer read access via content:// URI on all API levels.
        File outFile = new File(getContext().getFilesDir(), "pos_update.apk");
        if (outFile.exists()) {
            outFile.delete();
            flog("INFO", "Deleted previous APK to free space");
        }
        flog("INFO", "Saving to: " + outFile.getAbsolutePath());

        InputStream is = conn.getInputStream();
        FileOutputStream fos = new FileOutputStream(outFile);
        try {
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
            fos.flush();
        } finally {
            fos.close();
            is.close();
            conn.disconnect();
        }

        flog("INFO", "Download complete: " + outFile.length() + " bytes");
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

    private void installApk(File apkFile, PluginCall call) {
        flog("INFO", "Preparing install intent — SDK=" + Build.VERSION.SDK_INT);

        Uri apkUri;
        boolean useGrantFlag;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            // API 24+: file:// throws FileUriExposedException — must use FileProvider
            try {
                String authority = getContext().getPackageName() + ".fileprovider";
                flog("INFO", "FileProvider authority: " + authority);
                apkUri = FileProvider.getUriForFile(getContext(), authority, apkFile);
                flog("INFO", "FileProvider URI: " + apkUri);
                useGrantFlag = true;
            } catch (Exception e) {
                flogE("FileProvider.getUriForFile failed", e);
                call.reject("FileProvider error: " + e.getMessage());
                return;
            }
        } else {
            // API < 24 (e.g. Android 5.1 Citaq): package installer does not support
            // content:// URIs — use file:// URI directly (no FileUriExposedException on old Android)
            boolean readable = apkFile.setReadable(true, false);
            flog("INFO", "file:// URI path; setReadable=" + readable);
            apkUri = Uri.fromFile(apkFile);
            flog("INFO", "File URI: " + apkUri);
            useGrantFlag = false;
        }

        final Uri finalUri = apkUri;
        final boolean grantFlag = useGrantFlag;
        flog("INFO", "Dispatching startActivity on UI thread");

        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(finalUri, "application/vnd.android.package-archive");
                if (grantFlag) intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                flog("INFO", "Calling startActivity...");
                getContext().startActivity(intent);
                flog("INFO", "=== Install intent fired successfully ===");
                call.resolve();
            } catch (Exception e) {
                flogE("startActivity failed", e);
                call.reject("Could not open installer: " + e.getMessage());
            }
        });
    }
}
