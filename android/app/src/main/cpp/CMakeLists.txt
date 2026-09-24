cmake_minimum_required(VERSION 3.22)
project(CardioSda CXX)

# react-android AAR exposes jsi via its prefab package "ReactAndroid".
# Gradle unpacks the prefab when buildFeatures.prefab = true in build.gradle.
find_package(ReactAndroid REQUIRED CONFIG)

# Path to React Native's node_modules for any headers not in the prefab
set(RN_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../node_modules/react-native")

add_library(CardioSda SHARED
    sda/filter.cpp
    sda/ecg_sqi.cpp
    sda/pcg_sqi.cpp
    sda/sqa_engine.cpp
    sda/sqa_host_object.cpp
    sda/mel_spec.cpp
    sda/sda_module.cpp
)

# ReactAndroid::jsi brings its own INTERFACE_INCLUDE_DIRECTORIES (the prefab headers),
# so the jsi/jsi.h include path is handled automatically when we link against it.
target_include_directories(CardioSda PRIVATE sda)

target_compile_options(CardioSda PRIVATE
    -O2
    -ffast-math
)

target_compile_features(CardioSda PRIVATE cxx_std_17)

find_library(log_lib     log)
find_library(android_lib android)

target_link_libraries(CardioSda
    ReactAndroid::jsi   # provides libjsi.so + jsi headers
    ${log_lib}
    ${android_lib}
)
