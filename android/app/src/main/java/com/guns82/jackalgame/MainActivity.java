package com.guns82.jackalgame;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(JackalBluetoothPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
