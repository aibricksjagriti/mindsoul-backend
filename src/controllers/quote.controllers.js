import { db } from "../config/firebase.js";
import { sendQuoteRequestEmail } from "../services/quoteEmailService.js";

export const createQuoteRequest = async (req , res) => {
  try {
    const data = req.body;

    //payload
    const payload = {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      company: data.company || null,
      jobTitle: data.jobTitle || null,
      country: data.country,
      employees: data.employees,
      allowCommunication: data.allowCommunication || false,
      createdAt: new Date()
    };


    //save payload inside collection quoteRequests in db
    const docRef = await db.collection("quoteRequests").add(payload);

    //Trigger an email notification using the payload data
    await sendQuoteRequestEmail(payload);

    // Send a success response back to the client with the new document ID
    return res.status(201).json({
      success: true,
      message: "Quote request created successfully",
      id: docRef.id,
    })


  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to create quote request",
      error: error.message,
    });
  }
}