# 🏠 Suryavin Veedu — Roommate Expense Tracker (`sv-home-expenses`)

A personalized, mobile-first roommate expense tracker built for **Saravanan**, **Surya**, **Ram**, and **Sathish**.  
Hosted on **Vercel** and powered by **Google Drive (Google Sheets + Apps Script)** as a 100% free real-time cloud database.

---

## 📱 Mobile-First Design & Screens

The app is designed like a native mobile fintech app (GPay / Splitwise style) with a fixed bottom navigation bar:

1. **🏠 Home (Balances & Settlements)**
   - **Total House Expenses** hero summary card with quick actions.
   - **🤝 Who Should Pay Whom**: Automatically calculates net balances and tells who should pay how much to whom (with a 1-tap **`✓ Pay Now`** button and a toggle between **Simplified Split** and **Direct Pairwise** modes).
   - **🏠 Roommate Balances**: 2×2 mobile grid showing each roommate's live net status (`Gets Back`, `Needs to Pay`, or `Settled Up`) alongside total spent and share.

2. **➕ Add Expense**
   - Large mobile keypad `₹` amount input (`inputmode="decimal"`).
   - 1-tap quick reason chips (*🛒 Groceries*, *🧴 Shampoo*, *🥛 Milk & Water*, *🍛 Food*, *💡 Bills & WiFi*, *🔥 Gas*).
   - **Who Paid?** 2×2 touch cards for **Saravanan**, **Surya**, **Ram**, and **Sathish**.
   - **Split Between Whom?** 2×2 touch toggle cards — select all 4 roommates or only those involved (e.g., if **Ram** buys shampoo for **Surya**, **Ram**, and **Sathish**, only those 3 split the cost equally). Each person's card updates live with their exact `₹` share.

3. **🤝 Settle Up (Minus Balance)**
   - When one roommate pays another back (full or partial payment), record it here to immediately subtract it from their balance.

4. **📊 Analytics & All Expenses in Order**
   - **📋 Member Calculation Check**: Mobile cards breaking down `Spent`, `Share`, `Paid Back`, `Received`, and `Net Balance` for all 4 roommates.
   - **🧾 All Expenses in Order**: Chronological card feed (`Newest First` or `Oldest First #1, #2, #3...`) for checking every expense and payment, with search, member/type filters, and **CSV Export**.

---

## 🗂️ Project Structure

- `index.html` — Mobile-first 4-tab application layout
- `styles.css` — Clean modern light fintech styling optimized for all mobile screen sizes
- `app.js` — Equal/subset split engine, simplified & pairwise debt calculator, analytics filters, and Google Drive sync
- `config.js` — Roommate configuration & pre-configured Google Apps Script Web App URL
- `google-drive-script.gs` — Google Apps Script backend code connected to Google Sheets in Google Drive
- `vercel.json` & `package.json` — Vercel deployment configuration

---

## 🚀 Deploying on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import `Saravanan2005real/sv-home-expenses`.
2. Leave all build settings as default and click **Deploy**.
3. Share the generated `sv-home-expenses.vercel.app` link with **Saravanan**, **Surya**, **Ram**, and **Sathish**!
