package com.guns82.jackalgame;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothServerSocket;
import android.bluetooth.BluetoothSocket;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(
    name = "JackalBluetooth",
    permissions = {
        @Permission(
            alias = "nearby",
            strings = {
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.BLUETOOTH_ADVERTISE
            }
        ),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION }, alias = "legacyLocation")
    }
)
public class JackalBluetoothPlugin extends Plugin {
    private static final UUID SERVICE_UUID = UUID.fromString("7e8f9a10-1121-4a31-8421-123456789abc");
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final Object writeLock = new Object();
    private volatile BluetoothServerSocket serverSocket;
    private volatile BluetoothSocket socket;
    private volatile BufferedWriter writer;
    private volatile boolean hosting;
    private BroadcastReceiver discoveryReceiver;

    @PluginMethod
    public void startHost(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) requestPermissionForAlias("nearby", call, "startHostPermissionResult");
        else startHostPermissionResult(call);
    }

    @PermissionCallback
    private void startHostPermissionResult(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && !hasPermission("nearby")) { permissionError(call); return; }
        BluetoothAdapter adapter = adapter(call);
        if (adapter == null) return;
        try {
            if (!adapter.isEnabled()) { call.reject("Включите Bluetooth на этом телефоне и повторите попытку."); return; }
            closeSockets();
            serverSocket = adapter.listenUsingRfcommWithServiceRecord("Шакал", SERVICE_UUID);
            hosting = true;
            io.execute(this::acceptPeers);
            JSObject result = new JSObject();
            result.put("deviceName", safeDeviceName(adapter));
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Не удалось создать Bluetooth-игру. Проверьте разрешения и настройки Bluetooth.", e);
        }
    }

    @PluginMethod
    public void requestDiscoverable(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) requestPermissionForAlias("nearby", call, "discoverablePermissionResult");
        else discoverablePermissionResult(call);
    }

    @PermissionCallback
    private void discoverablePermissionResult(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && !hasPermission("nearby")) { permissionError(call); return; }
        BluetoothAdapter adapter = adapter(call);
        if (adapter == null) return;
        try {
            if (!adapter.isEnabled()) { call.reject("Сначала включите Bluetooth в настройках телефона."); return; }
            Intent intent = new Intent(BluetoothAdapter.ACTION_REQUEST_DISCOVERABLE);
            intent.putExtra(BluetoothAdapter.EXTRA_DISCOVERABLE_DURATION, 300);
            startActivityForResult(call, intent, "discoverableResult");
        } catch (Exception e) {
            call.reject("Не удалось включить поиск телефона рядом.", e);
        }
    }

    @ActivityCallback
    private void discoverableResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            call.reject("Разрешите обнаружение телефона, чтобы соперник мог подключиться.");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void discoverDevices(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) requestPermissionForAlias("nearby", call, "discoverDevicesPermissionResult");
        else requestPermissionForAlias("legacyLocation", call, "discoverDevicesPermissionResult");
    }

    @PermissionCallback
    private void discoverDevicesPermissionResult(PluginCall call) {
        String permission = Build.VERSION.SDK_INT >= 31 ? "nearby" : "legacyLocation";
        if (!hasPermission(permission)) { permissionError(call); return; }
        BluetoothAdapter adapter = adapter(call);
        if (adapter == null) return;
        try {
            if (!adapter.isEnabled()) { call.reject("Включите Bluetooth, чтобы найти телефоны рядом."); return; }
            stopDiscoveryReceiver();
            JSArray devices = new JSArray();
            Set<BluetoothDevice> bonded = adapter.getBondedDevices();
            if (bonded != null) for (BluetoothDevice device : bonded) devices.put(deviceInfo(device));
            IntentFilter filter = new IntentFilter(BluetoothDevice.ACTION_FOUND);
            filter.addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED);
            discoveryReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    String action = intent.getAction();
                    if (BluetoothDevice.ACTION_FOUND.equals(action)) {
                        BluetoothDevice device = getDeviceExtra(intent);
                        if (device != null) {
                            JSObject event = deviceInfo(device);
                            notifyListeners("deviceFound", event);
                        }
                    } else if (BluetoothAdapter.ACTION_DISCOVERY_FINISHED.equals(action)) {
                        JSObject event = new JSObject();
                        event.put("scanning", false);
                        notifyListeners("scanState", event);
                        stopDiscoveryReceiver();
                    }
                }
            };
            if (Build.VERSION.SDK_INT >= 33) {
                ContextCompat.registerReceiver(getContext(), discoveryReceiver, filter, ContextCompat.RECEIVER_EXPORTED);
            } else {
                getContext().registerReceiver(discoveryReceiver, filter);
            }
            adapter.cancelDiscovery();
            JSObject result = new JSObject();
            result.put("devices", devices);
            result.put("scanning", adapter.startDiscovery());
            call.resolve(result);
            JSObject scan = new JSObject();
            scan.put("scanning", true);
            notifyListeners("scanState", scan);
        } catch (Exception e) {
            stopDiscoveryReceiver();
            call.reject("Не удалось найти устройства Bluetooth. Проверьте разрешения.", e);
        }
    }

    @PluginMethod
    public void connect(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) requestPermissionForAlias("nearby", call, "connectPermissionResult");
        else connectPermissionResult(call);
    }

    @PermissionCallback
    private void connectPermissionResult(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31 && !hasPermission("nearby")) { permissionError(call); return; }
        BluetoothAdapter adapter = adapter(call);
        if (adapter == null) return;
        String address = call.getString("address");
        if (address == null || address.isEmpty()) { call.reject("Не выбран телефон."); return; }
        try {
            if (!adapter.isEnabled()) { call.reject("Включите Bluetooth и повторите подключение."); return; }
            BluetoothDevice device = adapter.getRemoteDevice(address);
            adapter.cancelDiscovery();
            io.execute(() -> {
                try {
                    closeCurrentSocket();
                    BluetoothSocket client = device.createRfcommSocketToServiceRecord(SERVICE_UUID);
                    client.connect();
                    socket = client;
                    writer = new BufferedWriter(new OutputStreamWriter(client.getOutputStream(), StandardCharsets.UTF_8));
                    connectionChanged(true, safeDeviceName(device));
                    call.resolve();
                    readMessages(client);
                } catch (Exception e) {
                    call.reject("Не удалось подключиться. Убедитесь, что второй телефон создал игру и разрешил обнаружение.", e);
                    connectionChanged(false, "");
                }
            });
        } catch (Exception e) {
            call.reject("Не удалось подключиться к выбранному телефону.", e);
        }
    }

    @PluginMethod
    public void send(PluginCall call) {
        String data = call.getString("data");
        if (data == null) { call.reject("Пустое сообщение."); return; }
        io.execute(() -> {
            try {
                BufferedWriter out = writer;
                if (out == null || socket == null || !socket.isConnected()) throw new IOException("Bluetooth-соединение отсутствует");
                synchronized (writeLock) {
                    out.write(data);
                    out.newLine();
                    out.flush();
                }
                call.resolve();
            } catch (Exception e) {
                call.reject("Связь потеряна. Попробуйте переподключиться.", e);
            }
        });
    }

    @PluginMethod
    public void stopDiscovery(PluginCall call) {
        BluetoothAdapter adapter = adapter(call);
        if (adapter != null) adapter.cancelDiscovery();
        stopDiscoveryReceiver();
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        hosting = false;
        stopDiscoveryReceiver();
        sendLeave();
        closeSockets();
        connectionChanged(false, "");
        call.resolve();
    }

    private void acceptPeers() {
        while (hosting) {
            try {
                BluetoothServerSocket server = serverSocket;
                if (server == null) return;
                BluetoothSocket accepted = server.accept();
                closeCurrentSocket();
                socket = accepted;
                writer = new BufferedWriter(new OutputStreamWriter(accepted.getOutputStream(), StandardCharsets.UTF_8));
                connectionChanged(true, safeDeviceName(accepted.getRemoteDevice()));
                readMessages(accepted);
            } catch (IOException e) {
                if (hosting) connectionChanged(false, "");
                return;
            } catch (SecurityException e) {
                connectionChanged(false, "");
                return;
            }
        }
    }

    private void readMessages(BluetoothSocket active) {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(active.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                JSObject event = new JSObject();
                event.put("data", line);
                notifyListeners("message", event);
            }
        } catch (IOException ignored) {
        } finally {
            try { active.close(); } catch (IOException ignored) {}
            if (socket == active) {
                socket = null;
                writer = null;
                connectionChanged(false, "");
            }
        }
    }

    private void connectionChanged(boolean connected, String deviceName) {
        JSObject event = new JSObject();
        event.put("connected", connected);
        event.put("deviceName", deviceName);
        notifyListeners("connection", event);
    }

    private JSObject deviceInfo(BluetoothDevice device) {
        JSObject item = new JSObject();
        item.put("address", device.getAddress());
        item.put("name", safeDeviceName(device));
        return item;
    }

    private String safeDeviceName(BluetoothDevice device) {
        try {
            String name = device.getName();
            return name == null || name.trim().isEmpty() ? "Телефон " + device.getAddress().substring(device.getAddress().length() - 5) : name;
        } catch (SecurityException e) {
            return "Телефон рядом";
        }
    }

    private String safeDeviceName(BluetoothAdapter adapter) {
        try {
            String name = adapter.getName();
            return name == null || name.trim().isEmpty() ? "этот телефон" : name;
        } catch (SecurityException e) {
            return "этот телефон";
        }
    }

    private BluetoothDevice getDeviceExtra(Intent intent) {
        if (Build.VERSION.SDK_INT >= 33) return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE, BluetoothDevice.class);
        //noinspection deprecation
        return intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE);
    }

    private BluetoothAdapter adapter(PluginCall call) {
        BluetoothManager manager = (BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null) call.reject("На этом устройстве нет Bluetooth.");
        return adapter;
    }

    private boolean hasPermission(String alias) {
        return getPermissionState(alias) == com.getcapacitor.PermissionState.GRANTED;
    }

    private void permissionError(PluginCall call) {
        call.reject("Разрешите приложению доступ к устройствам поблизости в настройках Android.");
    }

    private void stopDiscoveryReceiver() {
        BroadcastReceiver receiver = discoveryReceiver;
        discoveryReceiver = null;
        if (receiver != null) {
            try { getContext().unregisterReceiver(receiver); } catch (IllegalArgumentException ignored) {}
        }
    }

    private void closeCurrentSocket() {
        BluetoothSocket old = socket;
        socket = null;
        writer = null;
        if (old != null) try { old.close(); } catch (IOException ignored) {}
    }

    private void sendLeave() {
        BufferedWriter out = writer;
        if (out == null) return;
        try {
            synchronized (writeLock) {
                out.write("{\"type\":\"leave\"}");
                out.newLine();
                out.flush();
            }
        } catch (IOException ignored) {}
    }

    private void closeSockets() {
        BluetoothServerSocket server = serverSocket;
        serverSocket = null;
        if (server != null) try { server.close(); } catch (IOException ignored) {}
        closeCurrentSocket();
    }

    @Override
    protected void handleOnDestroy() {
        hosting = false;
        stopDiscoveryReceiver();
        sendLeave();
        closeSockets();
        io.shutdownNow();
        super.handleOnDestroy();
    }
}
