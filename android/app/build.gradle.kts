import java.net.URI
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.exists()) {
        keystorePropertiesFile.inputStream().use { load(it) }
    }
}

fun releaseSigningValue(propertyName: String, environmentName: String): String? =
    keystoreProperties.getProperty(propertyName)?.takeIf { it.isNotBlank() }
        ?: providers.environmentVariable(environmentName).orNull?.takeIf { it.isNotBlank() }

val releaseStoreFileValue = releaseSigningValue("storeFile", "TRAVELPLANER_ANDROID_STORE_FILE")
val releaseStorePassword = releaseSigningValue("storePassword", "TRAVELPLANER_ANDROID_STORE_PASSWORD")
val releaseKeyAlias = releaseSigningValue("keyAlias", "TRAVELPLANER_ANDROID_KEY_ALIAS")
val releaseKeyPassword = releaseSigningValue("keyPassword", "TRAVELPLANER_ANDROID_KEY_PASSWORD")
val releaseSigningValues = linkedMapOf(
    "storeFile / TRAVELPLANER_ANDROID_STORE_FILE" to releaseStoreFileValue,
    "storePassword / TRAVELPLANER_ANDROID_STORE_PASSWORD" to releaseStorePassword,
    "keyAlias / TRAVELPLANER_ANDROID_KEY_ALIAS" to releaseKeyAlias,
    "keyPassword / TRAVELPLANER_ANDROID_KEY_PASSWORD" to releaseKeyPassword,
)
fun isUnsetReleaseSigningValue(value: String?): Boolean =
    value.isNullOrBlank() || value == "CHANGE_ME"

val productionWebUrl = "https://travelplaner-545.pages.dev/"

fun normalizedWebConfiguration(rawValue: String): Pair<String, String> {
    val raw = rawValue.trim()
    val uri = URI(raw)
    require(uri.scheme?.lowercase() in setOf("http", "https")) {
        "Web URL must use http or https: $raw"
    }
    require(!uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null) {
        "Web URL must contain a host and no credentials, query, or fragment: $raw"
    }
    val port = if (uri.port == -1) "" else ":${uri.port}"
    val origin = "${uri.scheme.lowercase()}://${uri.host}$port"
    return (raw.trimEnd('/') + "/") to origin
}

val debugWebConfiguration = normalizedWebConfiguration(
    providers.gradleProperty("travelplanerDebugWebUrl").orElse(productionWebUrl).get(),
)
val releaseWebConfiguration = normalizedWebConfiguration(productionWebUrl)

fun quoteBuildConfig(value: String): String =
    "\"${value.replace("\\", "\\\\").replace("\"", "\\\"")}\""

val releaseSigningConfigured = releaseSigningValues.values.none(::isUnsetReleaseSigningValue)
val releaseStoreFile = releaseStoreFileValue?.let(rootProject::file)

android {
    namespace = "com.travelplaner.app"
    compileSdk = 36

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "com.travelplaner.app"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
    }

    signingConfigs {
        if (releaseSigningConfigured) {
            create("release") {
                storeFile = releaseStoreFile
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        debug {
            buildConfigField("String", "WEB_BASE_URL", quoteBuildConfig(debugWebConfiguration.first))
            buildConfigField("String", "WEB_ORIGIN", quoteBuildConfig(debugWebConfiguration.second))
        }
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release")
            buildConfigField("String", "WEB_BASE_URL", quoteBuildConfig(releaseWebConfiguration.first))
            buildConfigField("String", "WEB_ORIGIN", quoteBuildConfig(releaseWebConfiguration.second))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

}

kotlin {
    jvmToolchain(17)
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.11.0")
    implementation("androidx.webkit:webkit:1.17.0")
}

val verifyReleaseSigning by tasks.registering {
    group = "verification"
    description = "Verifies that the Google Play upload signing credentials are complete."

    doLast {
        val missingValues = releaseSigningValues.filterValues(::isUnsetReleaseSigningValue).keys
        if (missingValues.isNotEmpty()) {
            throw GradleException(
                "Release signing is not configured. Missing: ${missingValues.joinToString()}",
            )
        }

        val configuredStoreFile = requireNotNull(releaseStoreFile)
        if (!configuredStoreFile.isFile) {
            throw GradleException("Release keystore was not found: $configuredStoreFile")
        }
    }
}

tasks.matching { it.name == "bundleRelease" }.configureEach {
    mustRunAfter(verifyReleaseSigning)
}

tasks.register("bundleStoreRelease") {
    group = "build"
    description = "Builds a Google Play upload bundle after verifying release signing."
    dependsOn(verifyReleaseSigning, "bundleRelease")
}
