package ro.programo.app;

import android.content.ClipData;
import android.content.ClipDescription;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PersistableBundle;
import android.os.SystemClock;
import android.print.PrintAttributes;
import android.print.PrintManager;
import androidx.core.content.FileProvider;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.UUID;

/**
 * What the web app needs from the phone that a WebView can't do by itself: hand a file it made to the share
 * sheet, print the page, copy text (the clipboard API is missing over plain http). Used from
 * client/src/lib/device.js. Capacitor only takes calls from the app's own server, and only from the main frame.
 */
@CapacitorPlugin(name = "Programo")
public class ProgramoPlugin extends Plugin {

    private static final int MAX_FILE_CHARS = 5_000_000;
    private static final int MAX_COPY_CHARS = 10_000;
    private static final long SAVE_GAP_MS = 1500;

    /**
     * When the last share sheet was opened. Set on Capacitor's plugin thread (calls run there one at a time),
     * cleared on the main thread when the app is back in front, i.e. the sheet was closed.
     */
    private volatile long lastSave;

    /** Runs each time the app starts: exports never outlive the session that made them. */
    @Override
    public void load() {
        clearShared();
    }

    /** Back from the share sheet: the next tap is a new export, however soon it comes. */
    @Override
    protected void handleOnResume() {
        lastSave = 0;
    }

    /** The one folder in the app's private cache that file_paths.xml lets other apps be handed files from. */
    private File shared() {
        return new File(getContext().getCacheDir(), "shared");
    }

    private void clearShared() {
        deleteTree(shared());
    }

    private static void deleteTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteTree(child);
        file.delete();
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String text = call.getString("text");
        String type = call.getString("mimeType", "text/plain");
        if (text == null || text.length() > MAX_FILE_CHARS || !(type.equals("text/csv") || type.equals("text/plain"))) {
            call.reject("Not a file this app saves");
            return;
        }
        // A double tap would open a second share sheet and, by clearing the folder, break the first one still
        // underneath: a tap while the sheet is still on its way is taken as the same export.
        if (SystemClock.elapsedRealtime() - lastSave < SAVE_GAP_MS) {
            call.resolve();
            return;
        }
        String name = safeName(call.getString("name", ""), type.equals("text/csv") ? ".csv" : ".txt");
        // An older export may hold patient data or backup codes, so it goes before the new one is written. Each
        // export gets its own random folder: a link handed to another app earlier never shows newer data, and
        // the file keeps its plain name (that is the name the other app sees).
        File dir = new File(shared(), UUID.randomUUID().toString());
        try {
            clearShared();
            if (!dir.mkdirs()) throw new IOException("no folder");
            File file = new File(dir, name);
            try (FileOutputStream out = new FileOutputStream(file)) {
                out.write(text.getBytes(StandardCharsets.UTF_8));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent send = new Intent(Intent.ACTION_SEND).setType(type).putExtra(Intent.EXTRA_STREAM, uri);
            send.setClipData(ClipData.newRawUri(name, uri));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, name);
            getActivity().runOnUiThread(() -> getActivity().startActivity(chooser));
            lastSave = SystemClock.elapsedRealtime();
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Could not save the file");
        }
    }

    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            PrintManager printer = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
            String job = "Programo";
            printer.print(job, getBridge().getWebView().createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
            call.resolve();
        });
    }

    @PluginMethod
    public void copyText(PluginCall call) {
        String text = call.getString("text");
        if (text == null || text.isEmpty() || text.length() > MAX_COPY_CHARS) {
            call.reject("Nothing to copy");
            return;
        }
        boolean sensitive = Boolean.TRUE.equals(call.getBoolean("sensitive", false));
        getActivity().runOnUiThread(() -> {
            ClipData clip = ClipData.newPlainText("Programo", text);
            if (sensitive && Build.VERSION.SDK_INT >= 33) {
                // Android 13+ then hides it in the "copied" preview
                PersistableBundle extras = new PersistableBundle();
                extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true);
                clip.getDescription().setExtras(extras);
            }
            ((ClipboardManager) getContext().getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(clip);
            call.resolve();
        });
    }

    /** "../Rapoarte: luna.csv" → "Rapoarte_ luna.csv": no folders, letters (any language), digits and . _ - only. */
    static String safeName(String name, String ext) {
        String base = name.replaceAll("^.*[\\\\/]", "").replaceAll("[^\\p{L}\\p{N} ._-]", "_").replaceAll("^[ .]+", "").trim();
        if (base.toLowerCase(Locale.ROOT).endsWith(ext)) base = base.substring(0, base.length() - ext.length());
        if (base.length() > 80) base = base.substring(0, 80);
        return (base.isEmpty() ? "programo" : base) + ext;
    }
}
