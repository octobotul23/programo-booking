package ro.programo.app;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(ProgramoPlugin.class); // before super: that is where the bridge is built
        super.onCreate(savedInstanceState);

        // the recent-apps list shows a blank card instead of a snapshot of patient data (Android 13+)
        if (Build.VERSION.SDK_INT >= 33) setRecentsScreenshotEnabled(false);

        // No WebView on the phone (missing, disabled, or being updated): Capacitor shows its own "needs a WebView"
        // screen and builds no bridge, so there is nothing below to set up (and Back simply closes that screen).
        if (getBridge() == null) return;

        // The offline page is a fresh start: without this, Back would retry the failed address, fail, and land on
        // this page again (so Back could never leave the app), and every failed retry would add another entry.
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                String offline = getBridge().getErrorUrl();
                if (offline != null && offline.equals(view.getUrl())) view.clearHistory();
            }
        });

        // Back goes to the previous page inside the app; only on the first page does it leave the app.
        // Through the dispatcher, since Android 16 no longer calls onBackPressed() (predictive back).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web != null && web.canGoBack()) {
                    web.goBack();
                    return;
                }
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        });
    }
}
