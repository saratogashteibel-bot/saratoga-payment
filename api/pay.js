export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const XKEY = process.env.XKEY;
  
  if (!XKEY) {
    return res.status(500).json({ error: "Missing XKEY environment variable" });
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {
      return res.status(400).json({ error: "Invalid request body" });
    }
  }

  const { type, cardToken, cvvToken, exp, fname, lname, email, phone, street, city, state, zip, amount } = body;

  try {
    if (type === "donation") {
      const amt = parseFloat(amount);
      if (!amt || amt < 1) return res.status(400).json({ error: "Invalid amount: " + amount });

      const payload = {
        xKey: XKEY, xVersion: "4.5.9", xSoftwareName: "SaratogaShteibel", xSoftwareVersion: "1.0",
        xCommand: "cc:sale", xAmount: amt.toFixed(2), xCardNum: cardToken, xCVV: cvvToken, xExp: exp,
        xBillFirstName: fname, xBillLastName: lname, xBillStreet: street, xBillCity: city,
        xBillState: state, xBillZip: zip, xEmail: email, xDescription: "General Donation", xAllowDuplicate: true
      };

      const response = await fetch("https://x1.cardknox.com/gatewayjson", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.xResult !== "A") return res.json({ success: false, error: result.xError || "Payment declined" });
      return res.json({ success: true });

    } else if (type === "membership") {
      const chargePayload = {
        xKey: XKEY, xVersion: "4.5.9", xSoftwareName: "SaratogaShteibel", xSoftwareVersion: "1.0",
        xCommand: "cc:sale", xAmount: "50.00", xCardNum: cardToken, xCVV: cvvToken, xExp: exp,
        xBillFirstName: fname, xBillLastName: lname, xBillStreet: street, xBillCity: city,
        xBillState: state, xBillZip: zip, xEmail: email, xDescription: "Monthly Membership - First Payment", xAllowDuplicate: true
      };

      const chargeResponse = await fetch("https://x1.cardknox.com/gatewayjson", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(chargePayload)
      });
      const chargeResult = await chargeResponse.json();
      if (chargeResult.xResult !== "A") return res.json({ success: false, error: chargeResult.xError || "Payment declined" });

      const nextMonth = new Date();
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      const startDate = nextMonth.toISOString().split("T")[0];

      const schedulePayload = {
        SoftwareName: "SaratogaShteibel", SoftwareVersion: "1.0",
        NewCustomer: { BillFirstName: fname, BillLastName: lname, Email: email, BillStreet: street, BillCity: city, BillState: state, BillZip: zip },
        NewPaymentMethod: { Token: chargeResult.xToken, TokenType: "cc", Exp: exp, Street: street, Zip: zip, SetAsDefault: true },
        Amount: "50.00", IntervalType: "month", IntervalCount: 1,
        ScheduleName: `Monthly Membership - ${fname} ${lname}`,
        Description: "Monthly Membership", StartDate: startDate, CustReceipt: true
      };

      const scheduleResponse = await fetch("https://api.cardknox.com/v2/CreateSchedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": XKEY, "X-Recurring-Api-Version": "2.1" },
        body: JSON.stringify(schedulePayload)
      });
      const scheduleResult = await scheduleResponse.json();

      if (scheduleResult.Result !== "S") {
        return res.json({ success: true, warning: "First payment processed but recurring schedule could not be set up. Please contact us." });
      }
      return res.json({ success: true, recurring: true });

    } else {
      return res.status(400).json({ error: "Invalid payment type: " + type });
    }
  } catch(err) {
    console.error("Payment error:", err);
    return res.status(500).json({ error: "Server error: " + err.message });
  }
}
