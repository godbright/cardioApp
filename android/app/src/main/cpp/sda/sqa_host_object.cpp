#include "sqa_host_object.h"

using namespace facebook::jsi;

Value SqaHostObject::get(Runtime& rt, const PropNameID& prop) {
    const auto name = prop.utf8(rt);

    // getPayload() → {ready, score, pcgScore, ecgScore, tsMs, serSqi, eSqi, aSqi, bSqi, kSqi, basSqi}
    if (name == "getPayload") {
        return Function::createFromHostFunction(rt, prop, 0,
            [this](Runtime& rt, const Value&, const Value*, size_t) -> Value {
                const SqaPayload p = engine_->read();
                auto obj = Object(rt);
                obj.setProperty(rt, "ready",    Value(p.ready));
                obj.setProperty(rt, "score",    Value((double)p.overall_score));
                obj.setProperty(rt, "pcgScore", Value((double)p.pcg_score));
                obj.setProperty(rt, "ecgScore", Value((double)p.ecg_score));
                obj.setProperty(rt, "tsMs",     Value((double)p.timestamp_ms));
                obj.setProperty(rt, "serSqi",   Value((double)p.ser_sqi));
                obj.setProperty(rt, "eSqi",     Value((double)p.e_sqi));
                obj.setProperty(rt, "aSqi",     Value((double)p.a_sqi));
                obj.setProperty(rt, "bSqi",     Value((double)p.b_sqi));
                obj.setProperty(rt, "kSqi",     Value((double)p.k_sqi));
                obj.setProperty(rt, "basSqi",   Value((double)p.bas_sqi));
                return obj;
            });
    }

    // setMode(0|1|2) — 0=PCG, 1=ECG, 2=DUAL
    if (name == "setMode") {
        return Function::createFromHostFunction(rt, prop, 1,
            [this](Runtime& rt, const Value&, const Value* args, size_t count) -> Value {
                if (count >= 1 && args[0].isNumber()) {
                    const int m = static_cast<int>(args[0].asNumber());
                    engine_->setMode(m == 1 ? SqaMode::ECG
                                   : m == 2 ? SqaMode::DUAL
                                            : SqaMode::PCG);
                }
                return Value::undefined();
            });
    }

    // reset() — flush buffers and zero state
    if (name == "reset") {
        return Function::createFromHostFunction(rt, prop, 0,
            [this](Runtime&, const Value&, const Value*, size_t) -> Value {
                engine_->reset();
                return Value::undefined();
            });
    }

    return Value::undefined();
}

std::vector<PropNameID> SqaHostObject::getPropertyNames(Runtime& rt) {
    return PropNameID::names(rt, "getPayload", "setMode", "reset");
}
