plugins {
    id("com.android.application")
}

android {
    namespace = "com.mcxendo.handtracker"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mcxendo.handtracker"
        minSdk = 26
        targetSdk = 34
        versionCode = 4
        versionName = "1.3"
    }

    // A fixed key so each new build installs over the previous one
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // The app shows the same page as the web version in docs/
    sourceSets["main"].assets.srcDirs("../../docs")
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
