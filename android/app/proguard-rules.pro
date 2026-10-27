# OkHttp / Okio ship their own consumer rules.
# WorkManager instantiates workers by class name.
-keep class net.gryntech.ulak.upload.UploadWorker { <init>(...); }

# Strip verbose logging from release builds
-assumenosideeffects class android.util.Log {
    public static int v(...);
    public static int d(...);
    public static int i(...);
}
