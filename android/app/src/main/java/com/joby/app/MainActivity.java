package com.joby.app;

import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);

		try {
			if (this.bridge != null && this.bridge.getWebView() != null) {
				WebSettings settings = this.bridge.getWebView().getSettings();
				settings.setMediaPlaybackRequiresUserGesture(false);
			}
		} catch (Exception ignored) {
			// ignore
		}
	}
}
