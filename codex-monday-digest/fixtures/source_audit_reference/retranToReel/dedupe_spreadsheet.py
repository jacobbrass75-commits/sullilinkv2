def normalize_apn(value):
    return "".join(ch for ch in str(value) if ch.isdigit())
