package com.adventurengani.game;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

// Full screen (no status / navigation bars) and the screen kept on while playing.
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        useHighestRefreshRate();
    }

    // Ask for the screen's fastest mode (90 / 120 Hz on phones that have it). Android often keeps
    // apps at 60 Hz unless they ask, and the WebView's frame rate (requestAnimationFrame) follows it.
    private void useHighestRefreshRate() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            Display display = getWindowManager().getDefaultDisplay();
            Display.Mode current = display.getMode(), best = current;
            for (Display.Mode m : display.getSupportedModes()) {
                if (m.getPhysicalWidth() == current.getPhysicalWidth() && m.getPhysicalHeight() == current.getPhysicalHeight()
                        && m.getRefreshRate() > best.getRefreshRate()) best = m;
            }
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            getWindow().setAttributes(lp);
        } catch (Exception ignored) { }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN);
        }
    }
}
