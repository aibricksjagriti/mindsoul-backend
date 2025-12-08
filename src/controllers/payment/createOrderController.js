import { razorpay } from "../../services/razorpayClient.js";
import { db as adminDb } from "../../config/firebase.js"; // NEW: import Firestore to fetch appointment

export const createRazorpayOrder = async (req, res) => {
  try {
    const user = req.user; //jwt authenticated user

    if (!user || !user.uid) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const { appointmentId, currency = "INR" } = req.body;

     
    // NEW: appointmentId must be provided
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "appointmentId is required.",
      });
    }

     
    // NEW: Fetch appointment from Firestore
    const appointmentRef = adminDb.collection("appointments").doc(appointmentId);
    const appointmentSnap = await appointmentRef.get();

    if (!appointmentSnap.exists) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
      });
    }

    const appointmentData = appointmentSnap.data();

     
    // NEW: Extract backend-controlled amount (sessionPrice)
    const amount = Number(appointmentData.amount); // amount stored in rupees

    if (!amount || isNaN(amount)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment amount. Contact support.",
      });
    }

    // Razorpay only accepts amount in paise (₹1 = 100 paise)
    const options = {
      amount: Math.round(amount * 100), // always convert rupees → paise
      currency,
      receipt: `receipt_${appointmentId}`,
    };

    const order = await razorpay.orders.create(options);

     //Save generated Razorpay order id inside appointment
    await appointmentRef.update({
      razorpayOrderId: order.id,  
      updatedAt: new Date(),       
    });

    return res.status(200).json({
      success: true,
      message: "Razorpay order created successfully",
      order,
      key: process.env.RAZORPAY_KEY_ID, // For frontend checkout
      appointmentId, 
      counsellorName: appointmentData.counsellorName, 
    });
  } catch (error) {
    console.error("Razorpay Order Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Razorpay order",
      error: error.message,
    });
  }
};


// ------------------------------------------------------------
// TEST MODE: Razorpay Order Creation (No Auth, No Firestore)
// ------------------------------------------------------------

// export const createRazorpayOrder_Test = async (req, res) => {
//   try {
//     const { amount = 500, currency = "INR" } = req.body;

//     if (!amount || isNaN(amount)) {
//       return res.status(400).json({
//         success: false,
//         message: "Amount is required and must be a number.",
//       });
//     }

//     // Razorpay requires paise
//     const options = {
//       amount: Math.round(Number(amount) * 100),
//       currency,
//       receipt: `test_receipt_${Date.now()}`,
//     };

//     const order = await razorpay.orders.create(options);

//     return res.status(200).json({
//       success: true,
//       message: "Test Razorpay order created successfully",
//       order,
//       key: process.env.RAZORPAY_KEY_ID, // frontend will use this
//     });

//   } catch (error) {
//     console.error("Test Razorpay Order Error:", error);
//     return res.status(500).json({
//       success: false,
//       message: "Failed to create Razorpay test order",
//       error: error.message,
//     });
//   }
// };
