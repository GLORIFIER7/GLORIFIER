plugins {
    kotlin("jvm") version "2.0.21"
}

group = "io.glorifier"
version = "0.1.0"

repositories { mavenCentral() }

dependencies {
    implementation("com.fasterxml.jackson.core:jackson-databind:2.18.2")
    testImplementation(kotlin("test"))
}

kotlin { jvmToolchain(17) }

tasks.test { useJUnitPlatform() }

dependencies { testImplementation("org.junit.jupiter:junit-jupiter:5.11.4") }