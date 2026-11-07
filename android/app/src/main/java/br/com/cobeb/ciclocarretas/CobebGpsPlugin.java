package br.com.cobeb.ciclocarretas;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

@CapacitorPlugin(name = "CobebGps")
public class CobebGpsPlugin extends Plugin {

    private static final String WATCHDOG_WORK_NAME = "cobeb_gps_watchdog";

    // Referência estática usada pelo CobebGpsService para emitir eventos ao JS
    static CobebGpsPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    // Task 1: chamado pelo CobebGpsService após renovação bem-sucedida de token.
    // O JS ouve "tokenRefreshed" e chama supabase.auth.setSession() para manter
    // a sessão do supabase-js sincronizada com o par renovado pelo nativo.
    static void emitTokenRefreshed(String accessToken, String refreshToken) {
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("accessToken",  accessToken);
        data.put("refreshToken", refreshToken);
        instance.notifyListeners("tokenRefreshed", data);
    }

    @PluginMethod
    public void startTracking(PluginCall call) {
        String supabaseUrl  = call.getString("supabaseUrl");
        String supabaseKey  = call.getString("supabaseKey");
        String accessToken  = call.getString("accessToken",  "");
        String refreshToken = call.getString("refreshToken", "");
        String viagemId     = call.getString("viagemId");

        Intent intent = new Intent(getContext(), CobebGpsService.class);
        intent.putExtra("supabaseUrl",  supabaseUrl);
        intent.putExtra("supabaseKey",  supabaseKey);
        intent.putExtra("accessToken",  accessToken);
        intent.putExtra("refreshToken", refreshToken);
        intent.putExtra("viagemId",     viagemId);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void updateToken(PluginCall call) {
        String accessToken  = call.getString("accessToken",  "");
        String refreshToken = call.getString("refreshToken", "");
        getContext()
                .getSharedPreferences(CobebGpsService.PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString("accessToken",  accessToken)
                .putString("refreshToken", refreshToken)
                .apply();
        call.resolve();
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        getContext().stopService(new Intent(getContext(), CobebGpsService.class));
        CobebGpsService.clearPrefsStatic(getContext());
        call.resolve();
    }

    // Task 4: lê o campo estático do serviço sem abrir uma bridge round-trip cara.
    @PluginMethod
    public void isRunning(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", CobebGpsService.running);
        call.resolve(ret);
    }

    // Task 6: retorna se o app já está isento de battery optimization.
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignoring = pm != null
                && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoring);
        call.resolve(ret);
    }

    // Task 6: abre o diálogo do sistema para isentar o app de battery optimization.
    // Só abre se ainda não estiver isento.
    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        if (pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
            call.resolve();
            return;
        }
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
        } catch (Exception e) {
            // dispositivo não suporta o intent (raro); não é erro crítico
        }
        call.resolve();
    }

    // Task 7: agenda watchdog WorkManager de 15 min com política KEEP (não duplica).
    @PluginMethod
    public void scheduleWatchdog(PluginCall call) {
        try {
            PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(
                    CobebGpsWorker.class, 15, TimeUnit.MINUTES)
                    .build();
            WorkManager.getInstance(getContext()).enqueueUniquePeriodicWork(
                    WATCHDOG_WORK_NAME,
                    ExistingPeriodicWorkPolicy.KEEP,
                    work);
        } catch (Exception e) {
            // WorkManager não inicializado — não é crítico para o rastreamento
        }
        call.resolve();
    }

    // Task 7: cancela o watchdog ao finalizar a viagem.
    @PluginMethod
    public void cancelWatchdog(PluginCall call) {
        try {
            WorkManager.getInstance(getContext()).cancelUniqueWork(WATCHDOG_WORK_NAME);
        } catch (Exception ignored) {}
        call.resolve();
    }
}
