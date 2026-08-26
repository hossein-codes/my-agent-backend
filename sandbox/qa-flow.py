#!/usr/bin/env python3
"""End-to-end shopper flow against the local API (sandbox QA)."""
import json
import time
import urllib.request

B = "http://127.0.0.1:3000/api/v1"


def call(method, path, body=None, token=None, headers=None):
    req = urllib.request.Request(B + path, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    data = json.dumps(body).encode() if body is not None else None
    try:
        with urllib.request.urlopen(req, data) as res:
            return res.status, json.loads(res.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


# 1) auth
PHONE = f"+98912{int(time.time()) % 10_000_000:07d}"
call("POST", "/auth/otp/request", {"phone": PHONE})
st, login = call("POST", "/auth/otp/verify", {"phone": PHONE, "code": "123456"})
token = login["accessToken"]
print("1) login ok — roles:", login["roles"])

# 2) pick a purchasable variant
st, detail = call("GET", "/catalog/products/evening-dress")
variant = next(v for v in detail["variants"] if v["purchasable"])
print("2) variant:", variant["sku"], "price:", variant["price"]["unit"])

# 3) add to cart
st, cart = call("POST", "/cart/items", {"variantId": variant["id"], "quantity": 1}, token)
print("3) cart — items:", len(cart["items"]), "subtotal:", cart["totals"]["subtotal"])

# 4) preview
st, preview = call("POST", "/checkout/preview", {"provinceName": "تهران"}, token)
ship = next(o for o in preview["shippingOptions"] if not o.get("freeShippingApplied"))
print("4) preview — options:", [o["name"] for o in preview["shippingOptions"]], "total:", preview["totals"]["total"])

# 5) submit order
st, order = call(
    "POST",
    "/checkout",
    {
        "receiverFirstName": "سارا",
        "receiverLastName": "احمدی",
        "receiverPhone": PHONE,
        "provinceName": "تهران",
        "cityName": "تهران",
        "postalCode": "1234567890",
        "line": "خیابان ولیعصر، کوچه بهار، پلاک ۵",
        "shippingMethodId": ship["methodId"],
    },
    token,
    headers={"Idempotency-Key": f"qa-{time.time()}"},
)
print("5) order:", order["orderNumber"], "status:", order["status"])
oid = order["orderId"]

# 6) initiate payment
st, pay = call("POST", f"/payments/orders/{oid}/initiate", {}, token)
print("6) gateway:", pay["gatewayUrl"][:90])

# 7) simulate returning from the gateway: the browser would hit the gateway's
#    callback (a backend URL) which verifies server-side and redirects to the
#    result page. QA hits the callback directly with the authority.
import urllib.parse
gw = urllib.parse.parse_qs(urllib.parse.urlparse(pay["gatewayUrl"]).query)
callback = gw["callback"][0]
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None
callback_with_auth = callback + (
    "" if "authority=" in callback else
    ("&" if "?" in callback else "?") + "authority=" + gw["authority"][0]
)
opener = urllib.request.build_opener(NoRedirect)
try:
    with opener.open(callback_with_auth) as res:
        print("7) callback status:", res.status)
except urllib.error.HTTPError as e:
    print("7) callback redirect:", e.code, "→", e.headers.get("Location"))

# 8) verify final order state from the backend (never trust the redirect)
st, final = call("GET", f"/orders/{oid}", None, token)
print("8) final:", final["status"], "| paid:", final["totals"]["paid"], "| timeline:", [h["to"] for h in final["history"]])

# 9) orders list + notifications
st, orders = call("GET", "/orders?page=1", None, token)
print("9) orders:", orders["total"], "| notifications:", call("GET", "/notifications", None, token)[1]["total"])

# 10) wishlist roundtrip
call("POST", "/wishlist", {"productId": detail["id"]}, token)
st, wl = call("GET", "/wishlist", None, token)
print("10) wishlist items:", wl["total"])
