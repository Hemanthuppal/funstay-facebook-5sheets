require("dotenv").config();
const { google } = require("googleapis");
const { createConnection } = require("./db");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAMES = [
//   "WithFlightsIF-Chat",
//   "WithFlightIF-Website",
  "WithoutFlightIF-Chat",
  "WithoutFlightIF-Website",
  
];
const RANGE = "A1:AB";

async function getAuthClient() {
  return new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  );
}

async function fetchSheetData(auth, sheetName) {
  const sheets = google.sheets({ version: "v4", auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${sheetName}!${RANGE}`,
  });
  return response.data.values || [];
}

function parsePhoneNumber(phone) {
  if (!phone) return { country_code: "", phone_number: "" };
  const cleanedPhone = phone.toString().replace(/^p:/, "").trim();
  const parsed = parsePhoneNumberFromString(cleanedPhone);
  if (parsed && parsed.isValid()) {
    return { country_code: `+${parsed.countryCallingCode}`, phone_number: parsed.nationalNumber };
  }
  return { country_code: "", phone_number: phone };
}

function formatDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "";
  const [day, month, year] = dateStr.split('_');
  if (!day || !month || !year) return "";
  const monthMap = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12'
  };
  return `${year}-${monthMap[month.toLowerCase()] || '01'}-${day.replace(/\D/g, '')}`;
}

function createDescription(leadData) {
  const descriptionFields = [
    { label: "When are you planning to travel?", value: leadData[12] || "" }, // M
    { label: "How soon do you want to book your holiday?", value: leadData[13] || "" }, // N
    { label: "What is your preferred language?", value: leadData[14] || "" }, // O
    { label: "How many adults (over 12 yrs) will be travelling?", value: leadData[15] || "" }, // P
    { label: "How many children (below 12 yrs) will be travelling?", value: leadData[16] || "" }, // Q
    { label: "What is your preferred hotel category?", value: leadData[17] || "" }, // R
    { label: "When is the best time to contact you?", value: leadData[18] || "" }, // S
    { label: "Any other information you would like to share?", value: leadData[19] || "" } ,// T
    {label: "Additional information", value: leadData[20]|| "" // U column
    }
  ];

  return descriptionFields
    .filter(field => field.value)
    .map(field => `${field.label}:\n${field.value}`)
    .join("\n\n");
}

function getPlatformValues(platform) {
  if (!platform) return { sources: "", secondarysource: "" };
  
  const platformLower = platform.toLowerCase().trim();
  
  if (platformLower === "fb") {
    return {
      sources: "fb",
      secondarysource: "Facebook (Paid)"
    };
  }
  if (platformLower === "ig") {
    return {
      sources: "ig",
      secondarysource: "Instagram (Paid)"
    };
  }
  return {
    sources: platform,
    secondarysource: platform
  };
}

async function processCustomerAndLead(connection, leadData) {
  if (!Array.isArray(leadData)) {
    console.error("❌ Invalid lead data format:", leadData);
    return;
  }

  try {
    // Extract values
    const created_time = leadData[1] || ""; // A column → lead_date
    const ad_name = leadData[3] || ""; // D column → ad_copy
    const adset_name = leadData[5] || ""; // F column → ad_set
    const campaign_name = leadData[7] || ""; // H column → lead_type
    const form_name = leadData[9] || ""; // J column → destination
   const platform = leadData[11] || ""; // L column
    const full_name = leadData[21]|| ""; // U column → name
    const phone_number = leadData[22]|| ""; // V column
    const email = leadData[23] || ""; // W column
    const city = leadData[24] || ""; // X column → origincity
     const is_qualified = leadData[25] || ""; // AA column → is_qualified
   const	is_quality	   = leadData[26] || ""; // AB column → is_quality
   const is_converted = leadData[27] || ""; // AC column → is_converted

    const description = createDescription(leadData);
    const { country_code, phone_number: parsedPhone } = parsePhoneNumber(phone_number);
    const { sources, secondarysource } = getPlatformValues(platform);


    // Check if the customer exists
    const [customerResults] = await connection.promise().query(
      "SELECT id, customer_status FROM customers WHERE phone_number = ? AND country_code = ?",
      [parsedPhone, country_code]
    );

    let customerId;
    let customerStatus = "new";

    if (customerResults.length > 0) {
      customerId = customerResults[0].id;
      customerStatus = customerResults[0].customer_status || "existing";
    } else {
      const [insertResult] = await connection.promise().query(
        "INSERT INTO customers (name, email, phone_number, country_code, customer_status) VALUES (?, ?, ?, ?, ?)",
        [full_name.trim(), email.trim(), parsedPhone.trim(), country_code.trim(), customerStatus]
      );
      customerId = insertResult.insertId;
    }

    // Prepare values
    const values = [
      created_time.trim(), 
      ad_name.trim(), 
      adset_name.trim(), 
      campaign_name.trim(),
     sources,  
      full_name.trim().toLowerCase(),
      email.trim().toLowerCase(), 
      parsedPhone.trim(), 
      country_code.trim(), 
      city.trim(),
      form_name.trim(), 
      "Meta", 
      secondarysource,  
      customerId, 
      customerStatus,
      description,
      is_qualified,
      is_quality,
    is_converted
    ];

    console.log("🔹 Prepared Data:", values);

    // Check for existing lead
    const [existingLead] = await connection.promise().query(
      "SELECT * FROM addleads WHERE lead_date = ? AND phone_number = ? AND country_code = ?",
      [created_time.trim(), parsedPhone.trim(), country_code.trim()]
    );

    if (existingLead.length === 0) {
      await connection.promise().query(
        `INSERT INTO addleads 
          (lead_date, ad_copy, ad_set, lead_type, sources, name, email, 
           phone_number, country_code, origincity, destination, 
           primarySource, secondarysource, customerid, customer_status, description,,is_qualified,is_quality,is_converted) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,?,?,?)`,
        values
      );
      console.log(`✅ Lead added for customer: ${full_name} (Customer ID: ${customerId})`);
    } else {
      console.log(`⚠️ Skipped duplicate lead for: ${email} / ${parsedPhone}`);

      // Update customer_status in addleads if necessary
      const existingLeadId = existingLead[0].id;
      await connection.promise().query(
        "UPDATE addleads SET customer_status = ? WHERE leadid = ?",
        [customerStatus, existingLeadId]
      );
      console.log(`🔄 Updated customer_status for lead ID ${existingLeadId} to ${customerStatus}`);
    }
  } catch (error) {
    console.error("❌ Error processing customer and lead:", error);
  }
}

async function insertIntoDB(data) {
  if (data.length <= 1) return;
  const connection = createConnection();
  try {
    for (const row of data.slice(1)) {
      if (!row[0]) continue; // Skip if created_time is empty
      await processCustomerAndLead(connection, row);
    }
  } catch (error) {
    console.error("❌ Error inserting into DB:", error);
  } finally {
    connection.end();
  }
}

async function syncDatas() {
  console.log("🔄 Syncing data from Google Sheets...");
  try {
    const auth = await getAuthClient();
    
    // Process each sheet sequentially
    for (const sheetName of SHEET_NAMES) {
      console.log(`📋 Processing sheet: ${sheetName}`);
      const data = await fetchSheetData(auth, sheetName);
      
      if (data.length > 0) {
        await insertIntoDB(data);
        console.log(`✅ ${sheetName} sync complete!`);
      } else {
        console.log(`❌ No data found in sheet: ${sheetName}`);
      }
    }
    
    console.log("✅ All sheets processed!");
  } catch (error) {
    console.error("❌ Error syncing data:", error);
  }
}

module.exports = { syncDatas };