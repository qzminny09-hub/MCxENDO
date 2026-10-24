package com.mcxendo.handtracker;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;

public class MainActivity extends Activity {
    private static final int CAMERA_REQUEST = 1;
    private static final int MIC_REQUEST = 2;
    // Serving the bundled page from an https origin gives it a secure context, which getUserMedia requires
    private static final String START_URL = "https://appassets.androidplatform.net/assets/index.html";

    private WebView webView;
    private PermissionRequest pendingRequest;
    private final Handler main = new Handler(Looper.getMainLooper());

    // Speech: WebView has no Web Speech API, so the page calls Android's recognizer through this bridge
    private SpeechRecognizer recognizer;
    private boolean listening;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (!Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny();
                    return;
                }
                if (has(Manifest.permission.CAMERA)) {
                    request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                } else {
                    pendingRequest = request;
                    requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_REQUEST);
                }
            }
        });

        webView.addJavascriptInterface(new SpeechBridge(), "AndroidSpeech");
        setContentView(webView);
        webView.loadUrl(START_URL);
    }

    private boolean has(String permission) {
        return checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED;
    }

    private class SpeechBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }

        @JavascriptInterface
        public void start() {
            main.post(() -> {
                listening = true;
                if (has(Manifest.permission.RECORD_AUDIO)) beginRecognition();
                else requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MIC_REQUEST);
            });
        }

        @JavascriptInterface
        public void stop() {
            main.post(() -> {
                listening = false;
                if (recognizer != null) recognizer.cancel();
            });
        }
    }

    private void sendSpeech(String type, String text) {
        String js = "window.onNativeSpeech && window.onNativeSpeech(" + JSONObject.quote(type) + "," + JSONObject.quote(text) + ")";
        webView.evaluateJavascript(js, null);
    }

    private static String firstResult(Bundle results) {
        ArrayList<String> list = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return list == null || list.isEmpty() ? "" : list.get(0);
    }

    private void restartSoon(long delayMs) {
        main.postDelayed(() -> { if (listening) beginRecognition(); }, delayMs);
    }

    private void beginRecognition() {
        if (!listening) return;
        if (recognizer == null) {
            recognizer = SpeechRecognizer.createSpeechRecognizer(this);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { sendSpeech("ready", ""); }
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onEvent(int eventType, Bundle params) {}

                @Override
                public void onPartialResults(Bundle partialResults) {
                    sendSpeech("partial", firstResult(partialResults));
                }

                @Override
                public void onResults(Bundle results) {
                    sendSpeech("final", firstResult(results));
                    restartSoon(100);
                }

                @Override
                public void onError(int error) {
                    if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                        listening = false;
                        sendSpeech("denied", "");
                        return;
                    }
                    // No match and silence timeouts are routine; keep listening
                    restartSoon(error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY ? 600 : 250);
                }
            });
        }
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        recognizer.startListening(intent);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == MIC_REQUEST) {
            if (granted) beginRecognition();
            else { listening = false; sendSpeech("denied", ""); }
            return;
        }
        if (requestCode != CAMERA_REQUEST || pendingRequest == null) return;
        if (granted) pendingRequest.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        else pendingRequest.deny();
        pendingRequest = null;
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (recognizer != null) recognizer.cancel();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (listening && recognizer != null) restartSoon(300);
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) recognizer.destroy();
        webView.destroy();
        super.onDestroy();
    }
}
