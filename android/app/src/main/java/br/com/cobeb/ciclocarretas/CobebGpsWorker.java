package br.com.cobeb.ciclocarretas;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/**
 * Task 7 — Watchdog periódico (15 min) via WorkManager.
 * Se as prefs indicarem viagem ativa e o serviço não estiver rodando, reinicia-o.
 * Agenda/cancela via CobebGpsPlugin.scheduleWatchdog() / cancelWatchdog().
 */
public class CobebGpsWorker extends Worker {

    private static final String TAG = "CobebGpsWorker";

    public CobebGpsWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (CobebGpsService.running) {
            Log.d(TAG, "Servico ja esta rodando — watchdog ocioso");
            return Result.success();
        }

        SharedPreferences prefs = getApplicationContext()
                .getSharedPreferences(CobebGpsService.PREFS_NAME, Context.MODE_PRIVATE);
        String viagemId    = prefs.getString("viagemId",    null);
        String supabaseUrl = prefs.getString("supabaseUrl", null);

        if (viagemId == null || supabaseUrl == null) {
            Log.d(TAG, "Sem viagem ativa — watchdog ocioso");
            return Result.success();
        }

        Log.i(TAG, "Servico parado com viagem ativa — reiniciando");
        Intent intent = new Intent(getApplicationContext(), CobebGpsService.class);
        // Sem extras: onStartCommand restaura da prefs
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getApplicationContext().startForegroundService(intent);
            } else {
                getApplicationContext().startService(intent);
            }
        } catch (Exception e) {
            // ForegroundServiceStartNotAllowedException (Android 12+) se app em background restrito
            Log.e(TAG, "Falha ao reiniciar servico: " + e.getMessage());
        }
        return Result.success();
    }
}
