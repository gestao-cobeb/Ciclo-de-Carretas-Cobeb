package br.com.cobeb.ciclocarretas;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Task 7 — Reinicia o serviço de rastreamento após boot do dispositivo,
 * se houver uma viagem ativa nas SharedPreferences.
 * Requer RECEIVE_BOOT_COMPLETED no AndroidManifest.
 */
public class CobebBootReceiver extends BroadcastReceiver {

    private static final String TAG = "CobebBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;

        SharedPreferences prefs = context.getSharedPreferences(
                CobebGpsService.PREFS_NAME, Context.MODE_PRIVATE);
        String viagemId    = prefs.getString("viagemId",    null);
        String supabaseUrl = prefs.getString("supabaseUrl", null);

        if (viagemId == null || supabaseUrl == null) {
            Log.d(TAG, "Boot sem viagem ativa");
            return;
        }

        Log.i(TAG, "Boot com viagem ativa — reiniciando servico");
        Intent serviceIntent = new Intent(context, CobebGpsService.class);
        // Sem extras: onStartCommand restaura das prefs
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Falha ao iniciar servico no boot: " + e.getMessage());
        }
    }
}
