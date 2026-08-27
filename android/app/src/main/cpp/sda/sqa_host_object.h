#pragma once
#include <jsi/jsi.h>
#include "sqa_engine.h"
#include <memory>

// JSI HostObject wrapping the SQA engine.
// Installed on global.CardioSqaModule at app startup.
// All methods are synchronous — no bridge serialization.
class SqaHostObject : public facebook::jsi::HostObject {
public:
    explicit SqaHostObject(std::shared_ptr<SqaEngine> engine)
        : engine_(std::move(engine)) {}

    facebook::jsi::Value get(facebook::jsi::Runtime& rt,
                             const facebook::jsi::PropNameID& name) override;

    void set(facebook::jsi::Runtime&,
             const facebook::jsi::PropNameID&,
             const facebook::jsi::Value&) override {}

    std::vector<facebook::jsi::PropNameID> getPropertyNames(
        facebook::jsi::Runtime& rt) override;

private:
    std::shared_ptr<SqaEngine> engine_;
};
