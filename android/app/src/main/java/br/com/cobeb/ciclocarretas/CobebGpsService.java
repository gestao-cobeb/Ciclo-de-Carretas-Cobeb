package br.com.cobeb.ciclocarretas;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Base64;
import android.util.Log;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Serviço nativo de rastreamento GPS — completamente independente do WebView/Capacitor.
 * Funciona com tela apagada, em Doze mode, e reinicia sozinho se morto (START_STICKY).
 */
public class CobebGpsService extends Service {

    private static final String TAG             = "CobebGpsService";
    private static final String CHANNEL_ID      = "cobeb_gps_channel";
    private static final int    NOTIFICATION_ID = 99201;
    static final String         PREFS_NAME      = "cobeb_gps_prefs";

    private static final long SYNC_INTERVAL_S      = 30L;
    private static final long LOCATION_INTERVAL_MS = 10_000L;
    private static final int  CONNECT_TIMEOUT_MS   = 10_000;
    private static final int  READ_TIMEOUT_MS      = 10_000;

    // Lido por CobebGpsPlugin.isRunning() sem cruzar a bridge Capacitor
    static volatile boolean running = false;

    private FusedLocationProviderClient fusedClient;
    private LocationCallback            locationCallback;
    private HandlerThread               callbackThread;
    private ScheduledExecutorService    syncExecutor;
    private PowerManager.WakeLock       wakeLock;
    private ConnectivityManager         connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private volatile Location           lastLocation;

    // Protege renovação de token contra chamadas concorrentes do executor
    private final Object tokenLock = new Object();

    private String          supabaseUrl;
    private String          supabaseKey;
    private volatile String accessToken;
    private volatile String refreshToken;
    private String          viagemId;
    private String          motoristaId; // extraído do campo "sub" do JWT

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        running = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null
                && intent.hasExtra("supabaseUrl")
                && intent.hasExtra("viagemId")) {
            supabaseUrl  = intent.getStringExtra("supabaseUrl");
            supabaseKey  = intent.getStringExtra("supabaseKey");
            accessToken  = intent.getStringExtra("accessToken");
            refreshToken = intent.getStringExtra("refreshToken");
            viagemId     = intent.getStringExtra("viagemId");
            motoristaId  = extractJsonString(decodeJwtPayload(accessToken), "sub");
            persistPrefs();
        } else {
            // Reiniciado pelo Android (START_STICKY) — restaura das prefs
            restorePrefs();
        }

        if (supabaseUrl == null || viagemId == null) {
            stopSelf();
            return START_NOT_STICKY;
        }

        promoteToForeground();
        acquireWakeLock();
        startLocationTracking();
        startSyncExecutor();
        registerNetworkCallback();

        Log.i(TAG, "Rastreamento iniciado para viagem " + viagemId);
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "onDestroy");
        running = false;
        cleanup();
        super.onDestroy();
    }

    // Task 5: onTaskRemoved não encerra mais o serviço nem limpa as prefs.
    // O rastreamento só para via CobebGps.stopTracking() (finalizar viagem).
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        Log.i(TAG, "onTaskRemoved — rastreamento continua em background");
        super.onTaskRemoved(rootIntent);
    }

    // ── Foreground notification ───────────────────────────────────────────────

    private void promoteToForeground() {
        createNotificationChannel();

        Intent launch = getPackageManager().getLaunchIntentForPackage(getPackageName());
        PendingIntent pi = PendingIntent.getActivity(
                this, 0, launch,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        builder.setContentTitle("COBEB Ciclo — Rastreamento ativo")
               .setContentText("COBEB está rastreando sua localização")
               .setSmallIcon(R.mipmap.ic_launcher)
               .setOngoing(true)
               .setPriority(Notification.PRIORITY_LOW)
               .setContentIntent(pi);
        Notification notif = builder.build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notif,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notif);
            }
        } catch (Exception e) {
            Log.e(TAG, "startForeground falhou: " + e.getMessage());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL_ID, "Rastreamento GPS", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("COBEB Ciclo rastreamento de viagem");
            ch.enableLights(false);
            ch.enableVibration(false);
            ch.setSound(null, null);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(ch);
        }
    }

    // ── WakeLock ──────────────────────────────────────────────────────────────

    private void acquireWakeLock() {
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null && (wakeLock == null || !wakeLock.isHeld())) {
            wakeLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK, "CobebCiclo:GpsWakeLock");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
            Log.i(TAG, "WakeLock adquirido");
        }
    }

    // ── Location tracking ─────────────────────────────────────────────────────

    private void startLocationTracking() {
        callbackThread = new HandlerThread("CobebGpsThread");
        callbackThread.start();
        Looper looper = callbackThread.getLooper();

        fusedClient = LocationServices.getFusedLocationProviderClient(this);

        // Task 3: setWaitForAccurateLocation(false) garante entrega rápida sem
        // bloquear em áreas com GPS ruim (galpão, zona rural sem satélites)
        LocationRequest request = new LocationRequest.Builder(LOCATION_INTERVAL_MS)
                .setMinUpdateIntervalMillis(5_000L)
                .setPriority(Priority.PRIORITY_HIGH_ACCURACY)
                .setMinUpdateDistanceMeters(0f)
                .setWaitForAccurateLocation(false)
                .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult result) {
                Location loc = result.getLastLocation();
                if (loc != null) {
                    lastLocation = loc;
                    // Enfileira no executor — nunca abre thread nova por callback
                    if (syncExecutor != null && !syncExecutor.isShutdown()) {
                        syncExecutor.execute(CobebGpsService.this::syncAgora);
                    }
                }
            }
        };

        try {
            fusedClient.requestLocationUpdates(request, locationCallback, looper);
            Log.i(TAG, "FusedLocationProvider registrado");
        } catch (SecurityException e) {
            Log.e(TAG, "Permissão de localização negada: " + e.getMessage());
        }
    }

    // ── Scheduled executor (Task 2) ───────────────────────────────────────────

    // Thread única: syncs não se sobreponham, elimina a corrida em que um PATCH
    // antigo sobrescrevia uma posição mais nova.
    private void startSyncExecutor() {
        syncExecutor = Executors.newSingleThreadScheduledExecutor();
        syncExecutor.scheduleWithFixedDelay(
                this::syncAgora, 0, SYNC_INTERVAL_S, TimeUnit.SECONDS);
    }

    // ── Network callback (Task 2) ─────────────────────────────────────────────

    private void registerNetworkCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities caps) {
                if (caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                    Log.i(TAG, "Rede validada — sync imediato");
                    if (syncExecutor != null && !syncExecutor.isShutdown()) {
                        syncExecutor.execute(CobebGpsService.this::syncAgora);
                    }
                }
            }
        };

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                connectivityManager.registerDefaultNetworkCallback(networkCallback);
            } else {
                NetworkRequest req = new NetworkRequest.Builder()
                        .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                        .build();
                connectivityManager.registerNetworkCallback(req, networkCallback);
            }
        } catch (Exception e) {
            Log.e(TAG, "Falha ao registrar NetworkCallback: " + e.getMessage());
        }
    }

    // ── Core sync ─────────────────────────────────────────────────────────────

    private void syncAgora() {
        Location loc = lastLocation;
        if (loc == null) return;

        try {
            refreshTokenIfNeeded();
            int code = patchViagem(loc);
            if (code == 401) {
                // Task 1: 401 → força renovação e tenta mais uma vez
                forcarRefreshToken();
                code = patchViagem(loc);
            }
            if (code >= 200 && code < 300) {
                verificarERegistrarSemSinal(); // Task 8
                salvarUltimoSyncOk(System.currentTimeMillis());
            }
        } catch (Exception e) {
            // sem rede: próximo tick do scheduleWithFixedDelay ou NetworkCallback tenta novamente
            Log.w(TAG, "Sync falhou: " + e.getMessage());
        }
    }

    // Task 3: envia motorista_pos_em (hora real do fix) além de last_seen_at (hora do envio).
    // Fix mais antigo que 10 min: envia só last_seen_at (posição pode não representar local atual).
    private int patchViagem(Location loc) throws Exception {
        final String url_ = supabaseUrl;
        final String key_ = supabaseKey;
        final String vid_ = viagemId;
        if (url_ == null || key_ == null || vid_ == null) return -1;

        final String token_ = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getString("accessToken", key_);
        final String bearer = (token_ != null && !token_.isEmpty()) ? token_ : key_;

        SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
        String now   = sdf.format(new Date());
        String posEm = sdf.format(new Date(loc.getTime()));
        boolean fixFresco = (System.currentTimeMillis() - loc.getTime()) < 10 * 60 * 1000L;

        String body;
        if (fixFresco) {
            body = String.format(Locale.US,
                    "{\"motorista_lat\":%f,\"motorista_lng\":%f,"
                    + "\"motorista_last_seen_at\":\"%s\","
                    + "\"motorista_pos_em\":\"%s\"}",
                    loc.getLatitude(), loc.getLongitude(), now, posEm);
        } else {
            body = String.format("{\"motorista_last_seen_at\":\"%s\"}", now);
        }

        URL url = new URL(url_ + "/rest/v1/viagens?id=eq." + vid_);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("PATCH");
        conn.setRequestProperty("apikey", key_);
        conn.setRequestProperty("Authorization", "Bearer " + bearer);
        conn.setRequestProperty("Content-Type", "application/json");
        conn.setRequestProperty("Prefer", "return=minimal");
        conn.setDoOutput(true);
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);

        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        conn.setFixedLengthStreamingMode(bytes.length);
        try (OutputStream os = conn.getOutputStream()) { os.write(bytes); }

        int code = conn.getResponseCode();
        Log.d(TAG, "PATCH HTTP " + code + " lat=" + loc.getLatitude() + " fixFresco=" + fixFresco);
        conn.disconnect();
        return code;
    }

    // ── Token refresh (Task 1) ────────────────────────────────────────────────

    private long getTokenExpiry(String token) {
        try {
            String payload = decodeJwtPayload(token);
            if (payload == null) return 0;
            int idx = payload.indexOf("\"exp\":");
            if (idx < 0) return 0;
            String after = payload.substring(idx + 6).trim();
            int end = 0;
            while (end < after.length() && Character.isDigit(after.charAt(end))) end++;
            return Long.parseLong(after.substring(0, end)) * 1000L;
        } catch (Exception e) { return 0; }
    }

    private String decodeJwtPayload(String token) {
        if (token == null || token.isEmpty()) return null;
        try {
            String[] parts = token.split("\\.");
            if (parts.length < 2) return null;
            return new String(
                    Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_PADDING),
                    StandardCharsets.UTF_8);
        } catch (Exception e) { return null; }
    }

    private String extractJsonString(String json, String key) {
        if (json == null) return null;
        String search = "\"" + key + "\":\"";
        int idx = json.indexOf(search);
        if (idx < 0) return null;
        int start = idx + search.length();
        int end   = json.indexOf("\"", start);
        return end < 0 ? null : json.substring(start, end);
    }

    private void refreshTokenIfNeeded() {
        synchronized (tokenLock) {
            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
            String curAccess = prefs.getString("accessToken", "");
            if (curAccess.isEmpty()) return;
            long expiry = getTokenExpiry(curAccess);
            if (expiry == 0 || System.currentTimeMillis() < expiry - 5 * 60 * 1000L) return;
            doRefreshToken(prefs);
        }
    }

    private void forcarRefreshToken() {
        synchronized (tokenLock) {
            Log.i(TAG, "Forcando renovacao de token (401)");
            doRefreshToken(getSharedPreferences(PREFS_NAME, MODE_PRIVATE));
        }
    }

    private void doRefreshToken(SharedPreferences prefs) {
        String curRefresh = prefs.getString("refreshToken", "");
        if (curRefresh.isEmpty() || supabaseUrl == null || supabaseKey == null) return;
        Log.i(TAG, "Renovando token");
        try {
            URL url = new URL(supabaseUrl + "/auth/v1/token?grant_type=refresh_token");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", supabaseKey);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);

            String body  = "{\"refresh_token\":\"" + curRefresh + "\"}";
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = conn.getOutputStream()) { os.write(bytes); }

            int code = conn.getResponseCode();
            if (code == 200) {
                StringBuilder sb = new StringBuilder();
                try (BufferedReader br = new BufferedReader(
                        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = br.readLine()) != null) sb.append(line);
                }
                String resp       = sb.toString();
                String newAccess  = extractJsonString(resp, "access_token");
                String newRefresh = extractJsonString(resp, "refresh_token");
                if (newAccess != null && !newAccess.isEmpty()) {
                    String finalRefresh = newRefresh != null ? newRefresh : curRefresh;
                    prefs.edit()
                         .putString("accessToken",  newAccess)
                         .putString("refreshToken", finalRefresh)
                         .apply();
                    accessToken  = newAccess;
                    refreshToken = finalRefresh;
                    Log.i(TAG, "Token renovado");
                    // Notifica o JS para sincronizar a sessão do supabase-js
                    CobebGpsPlugin.emitTokenRefreshed(newAccess, finalRefresh);
                }
            } else {
                Log.w(TAG, "Falha ao renovar token: HTTP " + code);
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.e(TAG, "Erro ao renovar token: " + e.getMessage());
        }
    }

    // ── Sem sinal telemetry (Task 8) ──────────────────────────────────────────

    private void salvarUltimoSyncOk(long ts) {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .edit().putLong("ultimo_sync_ok_em", ts).apply();
    }

    // Chamado antes de gravar ultimo_sync_ok_em bem-sucedido.
    // Se o gap desde o último ok for > 5 min, registra sem_sinal.
    private void verificarERegistrarSemSinal() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        long ultimo = prefs.getLong("ultimo_sync_ok_em", 0);
        if (ultimo == 0) return;
        long duracaoMs = System.currentTimeMillis() - ultimo;
        if (duracaoMs >= 5 * 60 * 1000L) {
            insertGpsEvento("sem_sinal", (int) (duracaoMs / 1000));
        }
    }

    private void insertGpsEvento(String evento, int duracaoSegundos) {
        final String url_ = supabaseUrl;
        final String key_ = supabaseKey;
        final String vid_ = viagemId;
        final String mid_ = motoristaId;
        if (url_ == null || key_ == null || vid_ == null || mid_ == null) return;

        final String token_ = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
                .getString("accessToken", key_);
        final String bearer = (token_ != null && !token_.isEmpty()) ? token_ : key_;

        try {
            URL url = new URL(url_ + "/rest/v1/gps_eventos");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("apikey", key_);
            conn.setRequestProperty("Authorization", "Bearer " + bearer);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Prefer", "return=minimal");
            conn.setDoOutput(true);
            conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
            conn.setReadTimeout(READ_TIMEOUT_MS);

            String body = String.format(Locale.US,
                    "{\"viagem_id\":\"%s\",\"motorista_id\":\"%s\","
                    + "\"evento\":\"%s\",\"duracao_segundos\":%d}",
                    vid_, mid_, evento, duracaoSegundos);
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            conn.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream os = conn.getOutputStream()) { os.write(bytes); }

            int code = conn.getResponseCode();
            Log.d(TAG, "gps_eventos INSERT HTTP " + code);
            conn.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "Falha ao inserir gps_evento: " + e.getMessage());
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    private void cleanup() {
        if (connectivityManager != null && networkCallback != null) {
            try { connectivityManager.unregisterNetworkCallback(networkCallback); } catch (Exception ignored) {}
        }
        if (fusedClient != null && locationCallback != null) {
            try { fusedClient.removeLocationUpdates(locationCallback); } catch (Exception ignored) {}
        }
        if (syncExecutor != null) { syncExecutor.shutdownNow(); syncExecutor = null; }
        if (callbackThread != null) { callbackThread.quitSafely(); callbackThread = null; }
        if (wakeLock != null && wakeLock.isHeld()) { wakeLock.release(); wakeLock = null; }
        stopForeground(true);
    }

    // ── SharedPreferences ─────────────────────────────────────────────────────

    private void persistPrefs() {
        getSharedPreferences(PREFS_NAME, MODE_PRIVATE).edit()
                .putString("supabaseUrl",  supabaseUrl)
                .putString("supabaseKey",  supabaseKey)
                .putString("accessToken",  accessToken  != null ? accessToken  : "")
                .putString("refreshToken", refreshToken != null ? refreshToken : "")
                .putString("viagemId",     viagemId)
                .putString("motoristaId",  motoristaId  != null ? motoristaId  : "")
                .apply();
    }

    private void restorePrefs() {
        SharedPreferences p = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        supabaseUrl  = p.getString("supabaseUrl",  null);
        supabaseKey  = p.getString("supabaseKey",  null);
        accessToken  = p.getString("accessToken",  null);
        refreshToken = p.getString("refreshToken", null);
        viagemId     = p.getString("viagemId",     null);
        motoristaId  = p.getString("motoristaId",  null);
        Log.i(TAG, "Restaurado de prefs: viagemId=" + viagemId);
    }

    // Chamado apenas por CobebGpsPlugin.stopTracking() — encerramento explícito
    static void clearPrefsStatic(Context ctx) {
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply();
    }
}
