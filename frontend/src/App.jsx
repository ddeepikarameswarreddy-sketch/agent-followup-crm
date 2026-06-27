import React, { useEffect, useMemo, useState } from "react";
import { api, API_BASE } from "./api";

const STATUS_FLOW = ["New", "Contacted", "Interested", "Site Visit", "Booking", "Payment"];
const SLOT_OPTIONS = [
  "10:00 AM - Phone follow-up",
  "11:30 AM - Site visit discussion",
  "02:30 PM - Document verification",
  "04:00 PM - Package explanation",
  "05:30 PM - Booking confirmation"
];

const initialForm = {
  name: "",
  phone: "",
  email: "",
  budget: "",
  area: "",
  timeline: "",
  documentTitle: "",
  documentUrl: "",
  source: "Agent Entry",
  status: "New",
  interestLevel: "Medium",
  preferredPackageId: "",
  nextFollowUpDate: "",
  preferredSlot: "",
  notes: ""
};

function Icon({ name }) {
  return <i className={`bi bi-${name}`} aria-hidden="true"></i>;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidGmail(value) {
  return /^[a-zA-Z0-9._%+-]+@gmail\.com$/.test(String(value || "").trim());
}

function isStrongPassword(value) {
  return String(value || "").length >= 6;
}

function isValidPhone(value) {
  return /^\d{10}$/.test(String(value || "").trim());
}

function localDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDate(value) {
  if (!value) return "Not set";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return text.slice(0, 10);
}

function formatAlertDue(alert, fallbackSlot = "") {
  const dateText = formatDate(alert?.dueAt || alert?.leadNextFollowUpDate);
  const slotText = alert?.leadPreferredSlot || fallbackSlot || "";
  return slotText ? `${dateText} | Slot: ${slotText}` : dateText;
}

function priorityClass(priority) {
  if (priority === "High") return "badge danger";
  if (priority === "Low") return "badge muted";
  return "badge warning";
}

function LoginPage({ authMode, setAuthMode, agentLogin, setAgentLogin, agentRegister, setAgentRegister, forgotEmail, setForgotEmail, resetForm, setResetForm, onLogin, onRegister, onForgotPassword, onResetPassword, loading, message, resetLink }) {
  const isRegister = authMode === "register";
  const isForgot = authMode === "forgot";
  const isReset = authMode === "reset";

  function cleanGmail(value) {
    return String(value || "").replace(/\s/g, "").toLowerCase();
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand-mark">LD</div>
        <span className="eyebrow">Sales Agent / Admin Portal</span>
        <h1>{isReset ? "Reset Password" : isForgot ? "Forgot Password" : isRegister ? "Register with Gmail" : "Login with Gmail"}</h1>
        <p>
          {isReset
            ? "Create a new password using your reset link."
            : isForgot
            ? "Enter your registered Gmail address. We will send a password reset link."
            : isRegister
            ? "Create an agent account using a Gmail address and a password of at least 6 characters."
            : "Login using the Gmail address and password you registered with. No demo login is used."}
        </p>

        {!isForgot && !isReset && (
          <div className="auth-switch" role="tablist" aria-label="Authentication mode">
            <button type="button" className={!isRegister ? "active" : ""} onClick={() => setAuthMode("login")}>Login</button>
            <button type="button" className={isRegister ? "active" : ""} onClick={() => setAuthMode("register")}>Register</button>
          </div>
        )}

        {isForgot ? (
          <form onSubmit={onForgotPassword} className="login-form">
            <label>
              Registered Gmail Address
              <input
                type="email"
                required
                pattern="^[a-zA-Z0-9._%+\\-]+@gmail\\.com$"
                title="Only Gmail addresses are allowed, example: name@gmail.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(cleanGmail(e.target.value))}
                placeholder="name@gmail.com"
                autoComplete="email"
              />
            </label>
            <button type="submit" disabled={loading}>
              <Icon name="send" /> {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <button type="button" className="ghost full-width" onClick={() => setAuthMode("login")}>Back to Login</button>
          </form>
        ) : isReset ? (
          <form onSubmit={onResetPassword} className="login-form">
            <label>
              Reset Token
              <input
                required
                value={resetForm.token}
                onChange={(e) => setResetForm({ ...resetForm, token: e.target.value.trim() })}
                placeholder="Paste reset token or use reset link"
                autoComplete="off"
              />
            </label>
            <label>
              New Password
              <input
                type="password"
                required
                minLength="6"
                value={resetForm.password}
                onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm New Password
              <input
                type="password"
                required
                minLength="6"
                value={resetForm.confirmPassword}
                onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                placeholder="Re-enter new password"
                autoComplete="new-password"
              />
            </label>
            <button type="submit" disabled={loading}>
              <Icon name="key" /> {loading ? "Resetting..." : "Reset Password"}
            </button>
            <button type="button" className="ghost full-width" onClick={() => setAuthMode("login")}>Back to Login</button>
          </form>
        ) : isRegister ? (
          <form onSubmit={onRegister} className="login-form">
            <label>
              Agent Name
              <input
                required
                value={agentRegister.name}
                onChange={(e) => setAgentRegister({ ...agentRegister, name: e.target.value })}
                placeholder="Sales Agent"
                autoComplete="name"
              />
            </label>
            <label>
              Gmail Address
              <input
                type="email"
                required
                pattern="^[a-zA-Z0-9._%+\\-]+@gmail\\.com$"
                title="Only Gmail addresses are allowed, example: name@gmail.com"
                value={agentRegister.email}
                onChange={(e) => setAgentRegister({ ...agentRegister, email: cleanGmail(e.target.value) })}
                placeholder="name@gmail.com"
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength="6"
                value={agentRegister.password}
                onChange={(e) => setAgentRegister({ ...agentRegister, password: e.target.value })}
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm Password
              <input
                type="password"
                required
                minLength="6"
                value={agentRegister.confirmPassword}
                onChange={(e) => setAgentRegister({ ...agentRegister, confirmPassword: e.target.value })}
                placeholder="Re-enter password"
                autoComplete="new-password"
              />
            </label>
            <button type="submit" disabled={loading}>
              <Icon name="person-check" /> {loading ? "Registering..." : "Register"}
            </button>
          </form>
        ) : (
          <form onSubmit={onLogin} className="login-form">
            <label>
              Gmail Address
              <input
                type="email"
                required
                pattern="^[a-zA-Z0-9._%+\\-]+@gmail\\.com$"
                title="Only Gmail addresses are allowed, example: name@gmail.com"
                value={agentLogin.email}
                onChange={(e) => setAgentLogin({ ...agentLogin, email: cleanGmail(e.target.value) })}
                placeholder="name@gmail.com"
                autoComplete="email"
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength="6"
                value={agentLogin.password}
                onChange={(e) => setAgentLogin({ ...agentLogin, password: e.target.value })}
                placeholder="Minimum 6 characters"
                autoComplete="current-password"
              />
            </label>
            <button type="button" className="forgot-link" onClick={() => setAuthMode("forgot")}>Forgot Password?</button>
            <button type="submit" disabled={loading}>
              <Icon name="box-arrow-in-right" /> {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        )}

        <div className="auth-note">
          <Icon name="shield-check" /> Gmail only. Password must be at least 6 characters. Register first, then login.
        </div>
        {message && <div className="toast inline">{message}</div>}
        {resetLink && (
          <div className="toast inline dev-reset-link">
            <strong>Development reset link:</strong>
            <a href={resetLink}>{resetLink}</a>
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({ label, value, icon }) {
  return (
    <article className="stat-card">
      <div className="stat-icon"><Icon name={icon} /></div>
      <span>{label}</span>
      <strong>{value || 0}</strong>
    </article>
  );
}

function RecommendationBox({ recommendation, selectedPackage }) {
  return (
    <aside className="panel recommendation-card">
      <h3><Icon name="stars" /> Rule-Based AI Output</h3>
      {selectedPackage && (
        <div className="mini-package">
          <strong>{selectedPackage.name}</strong>
          <span>{selectedPackage.displayPrice}</span>
        </div>
      )}
      {recommendation ? (
        <>
          <div className="score-box">
            <span>Lead Score</span>
            <strong>{recommendation.leadScore}/100</strong>
            <em>{recommendation.priority} Priority</em>
          </div>
          <h4>Suggested Package</h4>
          <p>{recommendation.selectedPackage?.name}</p>
          <p className="muted-text">
            {recommendation.selectedPackage?.displayPrice} <span className="dot-sep">|</span> {recommendation.selectedPackage?.areaSqYards} sq. yds
          </p>
          <h4>Suggested Slots</h4>
          <ul>{(recommendation.suggestedSlots || []).slice(0, 4).map((slot) => <li key={slot}>{slot}</li>)}</ul>
          <h4>Confirmation Message</h4>
          <div className="message-box">{recommendation.confirmationMessage}</div>
        </>
      ) : (
        <p className="muted-text">Fill lead details and generate recommendation. The rule-based layer suggests package, score, priority, follow-up slots, and confirmation message.</p>
      )}
    </aside>
  );
}

function Sidebar({ activeTab, setActiveTab, logout }) {
  const items = [
    ["dashboard", "speedometer2", "Dashboard"],
    ["entry", "person-plus", "Lead Entry"],
    ["availability", "calendar2-check", "Availability"],
    ["bookings", "journal-check", "Admin Booking List"],
    ["confirmation", "send-check", "Confirmation Page"],
    ["messages", "bell", "Message Automation"],
    ["packages", "boxes", "Land Packages"],
    ["reports", "file-earmark-spreadsheet", "Reports"]
  ];

  return (
    <aside className="sidebar">
      <div className="brand-mark">LD</div>
      <h2>Agent Portal</h2>
      <p>Sales Agent / Admin</p>
      <nav>
        {items.map(([key, icon, label]) => (
          <button key={key} className={`nav ${activeTab === key ? "active" : ""}`} onClick={() => setActiveTab(key)}>
            <Icon name={icon} /> {label}
          </button>
        ))}
        <button className="nav logout-btn" onClick={logout}><Icon name="box-arrow-left" /> Logout</button>
      </nav>
      <div className="sidebar-note">Agent/Admin can enter customer leads, validate booking slots, track payment/status, and view action history.</div>
    </aside>
  );
}

function Dashboard({ stats, leads, search, setSearch, statusFilter, setStatusFilter, loadDashboard, openLead, deleteLead }) {
  return (
    <section className="section-grid">
      <div className="hero-card">
        <div>
          <span className="eyebrow light"><Icon name="speedometer2" /> Sales Agent / Admin Dashboard</span>
          <h3>Records, status, priorities, and action history</h3>
          <p>Agents can monitor every lead stage from New to Payment, identify priority cases, and continue follow-up discipline.</p>
        </div>
        <div className="price-pill"><Icon name="database-check" /> PostgreSQL CRM</div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total Leads" value={stats.total} icon="people" />
        <StatCard label="New" value={stats.new} icon="person-plus" />
        <StatCard label="Interested" value={stats.interested} icon="hand-thumbs-up" />
        <StatCard label="Site Visit" value={stats.siteVisit} icon="calendar-check" />
        <StatCard label="Booking" value={stats.booking} icon="journal-check" />
        <StatCard label="High Priority" value={stats.highPriority} icon="exclamation-triangle" />
      </div>

      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3><Icon name="table" /> Lead Records</h3>
            <p className="muted-text">Search and filter customer records saved from the agent entry form.</p>
          </div>
          <button className="small-btn" onClick={loadDashboard}><Icon name="arrow-clockwise" /> Refresh</button>
        </div>
        <div className="filter-row">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, phone, email, area" />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {STATUS_FLOW.map((status) => <option key={status}>{status}</option>)}
          </select>
          <button onClick={loadDashboard}><Icon name="search" /> Apply</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th><th>Phone</th><th>Status</th><th>Priority</th><th>Score</th><th>Next Follow-up</th><th>Action</th>
              </tr>
            </thead>
            <tbody>
              {leads.length === 0 ? (
                <tr><td colSpan="7">No leads found. Add your first lead from Lead Entry.</td></tr>
              ) : leads.map((lead) => (
                <tr key={lead.id}>
                  <td><strong>{lead.name}</strong><br /><span>{lead.email || "No email"}</span></td>
                  <td>{lead.phone}</td>
                  <td><span className="badge">{lead.status}</span></td>
                  <td><span className={priorityClass(lead.priority)}>{lead.priority || "Medium"}</span></td>
                  <td>{lead.leadScore || 0}/100</td>
                  <td>{formatDate(lead.nextFollowUpDate)}</td>
                  <td>
                    <div className="actions compact-actions">
                      <button className="small-btn" onClick={() => openLead(lead.id)}><Icon name="eye" /> View</button>
                      <button className="small-btn danger-btn" onClick={() => deleteLead(lead.id, lead.name)}><Icon name="trash" /> Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function LeadEntry({ form, setForm, packages, selectedPackage, recommendation, loading, handleRecommend, handleSubmit, availability, checkAvailability, selectAvailabilitySlot }) {
  const setPhone = (value) => setForm({ ...form, phone: onlyDigits(value) });

  return (
    <section className="form-layout">
      <form className="panel lead-form" onSubmit={handleSubmit}>
        <span className="eyebrow"><Icon name="person-plus" /> Agent Entry Form</span>
        <h3>Customer Lead Entry Form</h3>
        <p className="muted-text">Email field accepts only valid email format. Phone number accepts only 10 digits.</p>
        <div className="form-grid">
          <label>Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Customer name" /></label>
          <label>Phone Number<input type="tel" inputMode="numeric" pattern="[0-9]{10}" maxLength="10" required value={form.phone} onChange={(e) => setPhone(e.target.value)} placeholder="10 digit phone number" /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="customer@example.com" /></label>
          <label>Budget<input value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} placeholder="Example: 4 Lakhs" /></label>
          <label>Area / Location<input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Example: Prakasam" /></label>
          <label>Timeline<input value={form.timeline} onChange={(e) => setForm({ ...form, timeline: e.target.value })} placeholder="Example: 30 days / urgent" /></label>
          <label>Source<select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option>Agent Entry</option><option>Website Enquiry</option><option>WhatsApp Enquiry</option><option>Phone Call</option></select></label>
          <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUS_FLOW.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label>Interest Level<select value={form.interestLevel} onChange={(e) => setForm({ ...form, interestLevel: e.target.value })}><option>Low</option><option>Medium</option><option>High</option></select></label>
          <label className="span-2">Package<select value={form.preferredPackageId} onChange={(e) => setForm({ ...form, preferredPackageId: e.target.value })}><option value="">Auto Suggest</option>{packages.map((pkg) => <option key={pkg.id} value={pkg.id}>{pkg.name}</option>)}</select></label>
          <label>Booking Calendar / Follow-up Date<input type="date" required value={form.nextFollowUpDate} onChange={(e) => setForm({ ...form, nextFollowUpDate: e.target.value })} /></label>
          <label>Preferred Slot<select value={form.preferredSlot} onChange={(e) => setForm({ ...form, preferredSlot: e.target.value })}><option value="">Select slot</option>{SLOT_OPTIONS.map((slot) => <option key={slot}>{slot}</option>)}</select></label>
          <label>Document Name<input value={form.documentTitle} onChange={(e) => setForm({ ...form, documentTitle: e.target.value })} placeholder="Example: Aadhaar / Agreement" /></label>
          <label>Document Link<input value={form.documentUrl} onChange={(e) => setForm({ ...form, documentUrl: e.target.value })} placeholder="Drive link or file note" /></label>
          <label className="span-2">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Customer requirement, budget, site visit interest"></textarea></label>
        </div>
        <div className="availability-mini">
          <div>
            <strong><Icon name="calendar2-check" /> Availability API + Conflict Prevention</strong>
            <p>Check selected date before saving a lead. Already used slots are blocked to prevent duplicate follow-ups/bookings.</p>
          </div>
          <button type="button" className="secondary" onClick={() => checkAvailability(form.nextFollowUpDate)}><Icon name="search" /> Check Availability</button>
        </div>
        {availability && (
          <div className="slot-grid">
            {availability.slots.map((slot) => (
              <button type="button" key={slot.time} className={slot.available ? "slot available" : "slot booked"} onClick={() => selectAvailabilitySlot(slot)}>
                <strong>{slot.time}</strong>
                <span>{slot.available ? "Available" : `Booked by ${slot.bookedBy?.name || "another lead"} (${slot.bookedBy?.status || "Scheduled"})`}</span>
              </button>
            ))}
          </div>
        )}
        <div className="actions">
          <button type="button" className="secondary" onClick={handleRecommend}><Icon name="stars" /> Generate AI Recommendation</button>
          <button type="submit" disabled={loading}><Icon name="save" /> {loading ? "Saving..." : "Save Lead"}</button>
          <button type="button" className="ghost" onClick={() => setForm(initialForm)}><Icon name="eraser" /> Clear</button>
        </div>
      </form>
      <RecommendationBox recommendation={recommendation} selectedPackage={selectedPackage} />
    </section>
  );
}

function AvailabilityPage({ availabilityDate, setAvailabilityDate, availability, checkAvailability, selectAvailabilitySlot }) {
  const selectedDate = availability?.date || availabilityDate;

  return (
    <section className="section-grid">
      <div className="hero-card">
        <div>
          <span className="eyebrow light"><Icon name="calendar2-week" /> Booking Calendar & Availability Screen</span>
          <h3>Availability APIs and conflict prevention</h3>
          <p>Select a date to see available and booked slots. Any existing lead with the same date and slot is blocked to avoid duplicate follow-ups or bookings.</p>
        </div>
        <div className="price-pill"><Icon name="shield-check" /> Conflict Check</div>
      </div>
      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3><Icon name="calendar-check" /> Check Availability</h3>
            <p className="muted-text">This calls the backend availability API and shows free/booked slots.</p>
            <p className="muted-text"><strong>Selected date:</strong> {selectedDate || "Choose a date"}. Click an available slot to use it in Lead Entry.</p>
          </div>
          <div className="inline-form">
            <input type="date" value={availabilityDate} onChange={(e) => setAvailabilityDate(e.target.value)} />
            <button onClick={() => checkAvailability(availabilityDate)}><Icon name="search" /> Check Slots</button>
          </div>
        </div>
        {availability && (
          <>
            <div className="calendar-summary">
              <span><strong>{availability.bookedCount || 0}</strong> booked</span>
              <span><strong>{(availability.slots || []).filter((slot) => slot.available).length}</strong> available</span>
            </div>
            <div className="slot-grid">
              {availability.slots.map((slot) => (
                <button type="button" key={slot.time} className={slot.available ? "slot available" : "slot booked"} onClick={() => selectAvailabilitySlot(slot, true)}>
                  <strong>{slot.time}</strong>
                  <span>{slot.available ? "Available - click to use in Lead Entry" : `Booked by ${slot.bookedBy?.name || "another lead"} (${slot.bookedBy?.status || "Scheduled"})`}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function AdminBookings({ leads, openLead, deleteLead }) {
  const bookings = leads.filter((lead) => lead.nextFollowUpDate && lead.preferredSlot);
  return (
    <section className="section-grid">
      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3><Icon name="journal-check" /> Admin Booking List</h3>
            <p className="muted-text">Site Visit, Booking, and Payment status leads are shown here for admin review.</p>
          </div>
        </div>
        <div className="booking-list">
          {bookings.length === 0 ? <p className="muted-text">No booking records yet.</p> : bookings.map((lead) => (
            <article className="booking-row" key={lead.id}>
              <div><strong>{lead.name}</strong><span>{lead.area || "Area not added"}</span></div>
              <div><span>Date</span><strong>{formatDate(lead.nextFollowUpDate)}</strong></div>
              <div><span>Slot</span><strong>{lead.preferredSlot || "Not selected"}</strong></div>
              <div><span>Status</span><strong>{lead.status}</strong></div>
              <div className="actions compact-actions">
                <button className="small-btn" onClick={() => openLead(lead.id)}><Icon name="eye" /> View</button>
                <button className="small-btn danger-btn" onClick={() => deleteLead(lead.id, lead.name)}><Icon name="trash" /> Delete</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PackagesPage({ packages, features }) {
  return (
    <section className="section-grid">
      <div className="hero-card">
        <div>
          <span className="eyebrow light"><Icon name="boxes" /> Land Package Reference</span>
          <h3>Red sandal farm land package information</h3>
          <p>Package details are used by the rule-based AI layer for recommendations and confirmation messages.</p>
        </div>
        <div className="price-pill">₹775 / sq. yard</div>
      </div>
      <div className="package-grid full">
        {packages.map((pkg) => (
          <article className="package-card" key={pkg.id}>
            <span>{pkg.cents} cents</span>
            <h3>{pkg.name}</h3>
            <strong>{pkg.displayPrice}</strong>
            <p>{pkg.areaSqYards} sq. yards <span className="dot-sep">|</span> Minimum returns: {pkg.minimumReturns}</p>
          </article>
        ))}
      </div>
      <div className="panel full">
        <h3><Icon name="check2-circle" /> Project Features</h3>
        <div className="feature-list">{features.map((feature) => <span key={feature}><Icon name="check-circle" /> {feature}</span>)}</div>
      </div>
    </section>
  );
}

function ConfirmationPage({ latestLead, selectedLead }) {
  const lead = latestLead || selectedLead;
  const recommendation = lead?.recommendation;
  const packageInfo = recommendation?.selectedPackage;
  return (
    <section className="section-grid confirmation-page">
      <div className="hero-card">
        <div>
          <span className="eyebrow light"><Icon name="send-check" /> Confirmation Page</span>
          <h3>Generated booking confirmation message</h3>
          <p>This page shows the latest saved lead summary and confirmation message generated by the rule-based AI layer.</p>
        </div>
        <div className="price-pill"><Icon name="check2-circle" /> Ready</div>
      </div>
      {!lead ? (
        <div className="panel full">
          <h3><Icon name="info-circle" /> No Confirmation Yet</h3>
          <p className="muted-text">Create a lead from Lead Entry to generate a confirmation message.</p>
        </div>
      ) : (
        <>
          <div className="panel full confirmation-summary">
            <div className="panel-head">
              <div>
                <h3><Icon name="person-check" /> {lead.name}</h3>
                <p className="muted-text">{lead.phone} <span className="dot-sep">|</span> {lead.email || "Email not added"}</p>
              </div>
            </div>
            <div className="detail-grid">
              <div><span>Status</span><strong>{lead.status}</strong></div>
              <div><span>Priority</span><strong>{lead.priority || recommendation?.priority || "Medium"}</strong></div>
              <div><span>Lead Score</span><strong>{lead.leadScore || recommendation?.leadScore || 0}/100</strong></div>
              <div><span>Follow-up Date</span><strong>{formatDate(lead.nextFollowUpDate)}</strong></div>
              <div><span>Preferred Slot</span><strong>{lead.preferredSlot || "Not selected"}</strong></div>
              <div><span>Source</span><strong>{lead.source || "Agent Entry"}</strong></div>
            </div>
          </div>
          <div className="panel full">
            <h3><Icon name="boxes" /> Suggested Package</h3>
            {packageInfo ? (
              <div className="package-confirmation">
                <strong>{packageInfo.name}</strong>
                <span>{packageInfo.displayPrice}</span>
                <p>{packageInfo.areaSqYards} sq. yards <span className="dot-sep">|</span> ₹{packageInfo.pricePerSqYard}/sq. yard</p>
              </div>
            ) : <p className="muted-text">Package suggestion is not available yet.</p>}
          </div>
          <div className="panel full">
            <h3><Icon name="chat-square-text" /> Confirmation Message</h3>
            <div className="message-box confirmation-message">
              {recommendation?.confirmationMessage || lead.confirmationMessage || "Lead saved successfully. Confirmation message will be generated after processing."}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function LeadDetails({ selectedLead, setActiveTab, newStatus, setNewStatus, updateLeadStatus, followupNote, setFollowupNote, addFollowup, validateCurrentBooking, bookingValidation, processSelectedLead, paymentForm, setPaymentForm, updatePaymentTracking, previewNotification, generateAutomatedMessages, deleteLead, deleteLeadAlerts, deleteAlert, notificationPreview }) {
  return (
    <section className="details-layout">
      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3>{selectedLead.name}</h3>
            <p>{selectedLead.phone} <span className="dot-sep">|</span> {selectedLead.email || "No email"} <span className="dot-sep">|</span> Source: {selectedLead.source}</p>
          </div>
          <div className="actions compact-actions">
            <button className="ghost" onClick={() => setActiveTab("dashboard")}><Icon name="arrow-left" /> Back to Dashboard</button>
            <button className="ghost danger-btn" onClick={() => deleteLead(selectedLead.id, selectedLead.name)}><Icon name="trash" /> Delete Lead</button>
          </div>
        </div>
        <div className="workflow">
          {STATUS_FLOW.map((status, index) => (
            <div key={status} className={`flow-step ${STATUS_FLOW.indexOf(selectedLead.status) >= index ? "done" : ""}`}>{status}</div>
          ))}
        </div>
        <div className="detail-grid">
          <div><span>Status</span><strong>{selectedLead.status}</strong></div>
          <div><span>Priority</span><strong>{selectedLead.priority}</strong></div>
          <div><span>Lead Score</span><strong>{selectedLead.leadScore}/100</strong></div>
          <div><span>Next Follow-up</span><strong>{formatDate(selectedLead.nextFollowUpDate)}</strong></div>
          <div><span>Preferred Slot</span><strong>{selectedLead.preferredSlot || "Not selected"}</strong></div>
          <div><span>Payment Status</span><strong>{selectedLead.payment?.status || "Pending"}</strong></div>
          <div><span>Budget</span><strong>{selectedLead.budget || "Not added"}</strong></div>
          <div><span>Area</span><strong>{selectedLead.area || "Not added"}</strong></div>
          <div><span>Timeline</span><strong>{selectedLead.timeline || "Not added"}</strong></div>
        </div>
        <div className="two-col">
          <div>
            <h4><Icon name="diagram-3" /> Update Status</h4>
            <div className="inline-form">
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>{STATUS_FLOW.map((s) => <option key={s}>{s}</option>)}</select>
              <button onClick={updateLeadStatus}><Icon name="check2-circle" /> Update</button>
            </div>
          </div>
          <div>
            <h4><Icon name="chat-left-text" /> Add Follow-up</h4>
            <div className="inline-form">
              <input value={followupNote} onChange={(e) => setFollowupNote(e.target.value)} placeholder="Follow-up note" />
              <button onClick={addFollowup}><Icon name="plus-circle" /> Add</button>
            </div>
          </div>
        </div>
        <div className="two-col">
          <div className="sub-panel">
            <h4><Icon name="shield-check" /> Booking Validation</h4>
            <p className="muted-text">Checks selected date and slot to prevent duplicate site visit/booking conflicts.</p>
            <button className="small-btn" onClick={validateCurrentBooking}><Icon name="intersect" /> Validate Booking Slot</button>
            {bookingValidation && <div className={bookingValidation.success === false ? "message-box error" : "message-box ok"}>{bookingValidation.message}</div>}
          </div>
          <div className="sub-panel">
            <h4><Icon name="gear" /> Process Lead</h4>
            <p className="muted-text">Runs rule-based AI, booking validation, and notification preview in one backend flow.</p>
            <button className="small-btn" onClick={processSelectedLead}><Icon name="play-circle" /> Process Lead</button>
          </div>
        </div>
        <div className="panel nested">
          <h4><Icon name="credit-card" /> Payment / Status Tracking</h4>
          <div className="form-grid">
            <label>Payment Status<select value={paymentForm.paymentStatus} onChange={(e) => setPaymentForm({ ...paymentForm, paymentStatus: e.target.value })}><option>Pending</option><option>Advance Paid</option><option>Paid</option><option>Verified</option><option>Failed</option></select></label>
            <label>Amount Paid<input inputMode="numeric" value={paymentForm.amountPaid} onChange={(e) => setPaymentForm({ ...paymentForm, amountPaid: e.target.value.replace(/\D/g, "") })} placeholder="Example: 50000" /></label>
            <label>Payment Mode<select value={paymentForm.paymentMode} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}><option>UPI</option><option>Cash</option><option>Bank Transfer</option><option>Cheque</option></select></label>
            <label>Receipt Note<input value={paymentForm.receiptNote} onChange={(e) => setPaymentForm({ ...paymentForm, receiptNote: e.target.value })} placeholder="Receipt or transaction note" /></label>
          </div>
          <div className="actions">
            <button onClick={updatePaymentTracking}><Icon name="credit-card" /> Update Payment</button>
            <button className="secondary" onClick={() => previewNotification("payment")}><Icon name="bell" /> Preview Payment Message</button>
          </div>
        </div>
        <div className="panel nested">
          <h4><Icon name="bell" /> Notification Logic</h4>
          <div className="actions">
            <button className="secondary" onClick={() => previewNotification("followup")}><Icon name="chat-dots" /> Follow-up Preview</button>
            <button className="secondary" onClick={() => previewNotification("booking")}><Icon name="send-check" /> Booking Preview</button>
            <button onClick={generateAutomatedMessages}><Icon name="magic" /> Generate Required Messages</button>
          </div>
          {notificationPreview && <div className="message-box">{notificationPreview}</div>}
        </div>
        {selectedLead.recommendation && (
          <div className="recommendation-output">
            <h4><Icon name="send-check" /> Confirmation Message</h4>
            <div className="message-box">{selectedLead.recommendation.confirmationMessage}</div>
          </div>
        )}
        <div className="two-col">
          <div className="sub-panel">
            <h4><Icon name="file-earmark-text" /> Documents</h4>
            {(selectedLead.documents || []).length === 0 ? <p className="muted-text">No document links saved.</p> : (selectedLead.documents || []).map((doc) => (
              <div className="history-item" key={doc.id}>
                <strong>{doc.title}</strong>
                <span>{doc.documentType} <span className="dot-sep">|</span> {doc.status}</span>
                {doc.url && <p>{doc.url}</p>}
              </div>
            ))}
          </div>
          <div className="sub-panel">
            <div className="panel-head compact-head">
              <h4><Icon name="bell" /> Alerts</h4>
              {(selectedLead.alerts || []).length > 0 && <button className="small-btn danger-btn" onClick={() => deleteLeadAlerts(selectedLead.id)}><Icon name="trash3" /> Clear Lead Alerts</button>}
            </div>
            {(selectedLead.alerts || []).length === 0 ? <p className="muted-text">No alerts generated.</p> : (selectedLead.alerts || []).slice(0, 8).map((alert) => (
              <div className="history-item" key={alert.id}>
                <strong>{alert.type} - {alert.status}</strong>
                <span>{alert.channel}{alert.dueAt ? ` | Due: ${formatAlertDue(alert, selectedLead.preferredSlot)}` : ""}</span>
                <p>{alert.message}</p>
                <button className="small-btn danger-btn" onClick={() => deleteAlert(alert.id, selectedLead.id)}><Icon name="trash" /> Delete Reminder</button>
              </div>
            ))}
          </div>
        </div>
        <h4><Icon name="clock-history" /> Action History</h4>
        <div className="history-list">
          {(selectedLead.history || []).slice().reverse().map((item, index) => (
            <div className="history-item" key={`${item.date}-${index}`}>
              <strong>{item.action}</strong>
              <span>{item.status} <span className="dot-sep">|</span> {new Date(item.date).toLocaleString()}</span>
              <p>{item.note}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}


function MessageAutomationPage({ openLead }) {
  const [date, setDate] = useState(localDate());
  const [dueAlerts, setDueAlerts] = useState([]);
  const [allAlerts, setAllAlerts] = useState([]);
  const [emailApi, setEmailApi] = useState(null);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [pageMessage, setPageMessage] = useState("");

  async function loadAutomationData(targetDate = date) {
    try {
      const [dueData, alertData, emailData] = await Promise.all([
        api.dueReminders(targetDate),
        api.alerts(""),
        api.emailStatus()
      ]);
      setDueAlerts(dueData.alerts || []);
      setAllAlerts(alertData.alerts || []);
      setEmailApi(emailData.emailApi || null);
      setPageMessage(`Loaded ${dueData.count || 0} due reminders and ${alertData.count || 0} total alerts`);
    } catch (error) {
      setPageMessage(error.message);
    }
  }

  async function sendTestEmail() {
    try {
      if (!testEmailTo || !isValidEmail(testEmailTo)) {
        setPageMessage("Enter a valid email address for test email");
        return;
      }
      const data = await api.testEmail({ to: testEmailTo });
      setPageMessage(data.message || "Test email sent successfully");
      await loadAutomationData(date);
    } catch (error) {
      setPageMessage(error.message);
    }
  }

  async function sendAlertEmail(alertId) {
    try {
      const data = await api.sendAlertEmail(alertId);
      setPageMessage(data.message || "Email sent successfully");
      await loadAutomationData(date);
    } catch (error) {
      setPageMessage(error.message);
    }
  }


  async function deleteReminder(alertId) {
    try {
      if (!window.confirm("Delete this notification/reminder record?")) return;
      const data = await api.deleteAlert(alertId);
      setPageMessage(data.message || "Notification/reminder deleted");
      await loadAutomationData(date);
    } catch (error) {
      setPageMessage(error.message);
    }
  }

  async function clearAllNotificationHistory() {
    try {
      if (!window.confirm("Delete all notification/reminder history? Leads will not be deleted.")) return;
      const data = await api.clearAlerts("");
      setPageMessage(data.message || "Notification/reminder history cleared");
      await loadAutomationData(date);
    } catch (error) {
      setPageMessage(error.message);
    }
  }

  useEffect(() => { loadAutomationData(date); }, []);

  return (
    <section className="section-grid">
      <div className="hero-card">
        <div>
          <span className="eyebrow light"><Icon name="bell" /> Automated Messaging</span>
          <h3>Reminders, confirmations, follow-ups, and Email API</h3>
          <p>Whenever a lead is created, processed, booked, paid, or followed up, the backend generates the required message. If Email API is enabled and the customer email exists, the message is sent to the customer and stored in PostgreSQL.</p>
        </div>
        <div className="price-pill"><Icon name="envelope-check" /> Email API Ready</div>
      </div>

      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3><Icon name="envelope-at" /> Email API Status</h3>
            <p className="muted-text">Uses SMTP/Nodemailer. For Gmail, add your Gmail address and app password in backend/.env.</p>
          </div>
          <button className="secondary" onClick={() => loadAutomationData(date)}><Icon name="arrow-clockwise" /> Refresh</button>
        </div>
        <div className="detail-grid">
          <div><span>Enabled</span><strong>{emailApi?.enabled ? "Yes" : "No"}</strong></div>
          <div><span>Configured</span><strong>{emailApi?.configured ? "Yes" : "No"}</strong></div>
          <div><span>Host</span><strong>{emailApi?.host || "Not loaded"}</strong></div>
          <div><span>Port</span><strong>{emailApi?.port || "-"}</strong></div>
          <div><span>From</span><strong>{emailApi?.from || "Not configured"}</strong></div>
        </div>
        <div className="inline-form email-test-row">
          <input type="email" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} placeholder="Enter email to test" />
          <button onClick={sendTestEmail}><Icon name="send" /> Send Test Email</button>
        </div>
        {pageMessage && <div className="message-box ok">{pageMessage}</div>}
      </div>

      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3><Icon name="alarm" /> Due Reminder Queue</h3>
            <p className="muted-text">Shows automated reminders due on or before the selected date.</p>
          </div>
          <div className="actions compact-actions">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <button className="secondary" onClick={() => loadAutomationData(date)}><Icon name="arrow-clockwise" /> Refresh</button>
          </div>
        </div>
        {(dueAlerts || []).length === 0 ? <p className="muted-text">No due reminders found for this date.</p> : (
          <div className="alert-grid">
            {dueAlerts.map((alert) => (
              <article className="history-item alert-card" key={alert.id}>
                <strong>{alert.type} - {alert.status}</strong>
                <span>{alert.leadName || "Lead"} <span className="dot-sep">|</span> {alert.channel} <span className="dot-sep">|</span> Due: {formatAlertDue(alert)}</span>
                <p>{alert.message}</p>
                <div className="actions compact-actions">
                  {alert.leadId && <button className="small-btn" onClick={() => openLead(alert.leadId)}><Icon name="box-arrow-up-right" /> Open Lead</button>}
                  {alert.leadEmail && ["confirmation", "booking", "payment", "followup"].includes(alert.type) && <button className="small-btn secondary" onClick={() => sendAlertEmail(alert.id)}><Icon name="envelope" /> Send Email</button>}
                  <button className="small-btn danger-btn" onClick={() => deleteReminder(alert.id)}><Icon name="trash" /> Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3><Icon name="list-check" /> Latest Generated Messages</h3>
            <p className="muted-text">These are stored in the alerts table, so admins can verify which reminders, confirmations, follow-ups, and email statuses were generated.</p>
          </div>
          {(allAlerts || []).length > 0 && <button className="small-btn danger-btn" onClick={clearAllNotificationHistory}><Icon name="trash3" /> Clear All History</button>}
        </div>
        {(allAlerts || []).length === 0 ? <p className="muted-text">No messages generated yet.</p> : (
          <div className="history-list">
            {allAlerts.slice(0, 12).map((alert) => (
              <div className="history-item" key={alert.id}>
                <strong>{alert.type} - {alert.status}</strong>
                <span>{alert.leadName || "Lead"} <span className="dot-sep">|</span> {alert.channel}{alert.dueAt ? ` | Due: ${formatAlertDue(alert)}` : ""}</span>
                <p>{alert.message}</p>
                <div className="actions compact-actions">
                  {alert.leadId && <button className="small-btn" onClick={() => openLead(alert.leadId)}><Icon name="box-arrow-up-right" /> Open Lead</button>}
                  {alert.leadEmail && ["confirmation", "booking", "payment", "followup"].includes(alert.type) && <button className="small-btn secondary" onClick={() => sendAlertEmail(alert.id)}><Icon name="envelope" /> Send Email</button>}
                  <button className="small-btn danger-btn" onClick={() => deleteReminder(alert.id)}><Icon name="trash" /> Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ReportsPage() {
  const [summary, setSummary] = useState(null);
  const [reportMessage, setReportMessage] = useState("");

  async function loadReport() {
    try {
      const data = await api.reportSummary();
      setSummary(data);
      setReportMessage("Report summary updated");
    } catch (error) {
      setReportMessage(error.message);
    }
  }

  useEffect(() => { loadReport(); }, []);

  return (
    <section className="section-grid">
      <div className="hero-card">
        <div>
          <span className="eyebrow light"><Icon name="file-earmark-spreadsheet" /> Messaging / Reports</span>
          <h3>CSV export, alert previews, and admin summary</h3>
          <p>Use this page for admin reports. WhatsApp messages are generated as previews, while customer emails can be sent through the Email API when SMTP is configured.</p>
        </div>
        <div className="price-pill"><Icon name="download" /> CSV Export</div>
      </div>

      <div className="panel full">
        <div className="panel-head">
          <div>
            <h3><Icon name="clipboard-data" /> CRM Report Summary</h3>
            <p className="muted-text">Status and priority counts are calculated from PostgreSQL lead records.</p>
          </div>
          <div className="actions compact-actions">
            <button className="secondary" onClick={loadReport}><Icon name="arrow-clockwise" /> Refresh</button>
            <a className="small-btn link-btn" href={`${API_BASE}/api/reports/leads.csv`}><Icon name="filetype-csv" /> Download CSV</a>
          </div>
        </div>
        {reportMessage && <div className="message-box ok">{reportMessage}</div>}
        {summary ? (
          <div className="stats-grid report-stats">
            <StatCard label="Total Leads" value={summary.total} icon="people" />
            <StatCard label="Active Bookings" value={summary.activeBookings} icon="calendar-check" />
            <StatCard label="High Priority" value={summary.byPriority?.High} icon="exclamation-triangle" />
            <StatCard label="Payment Stage" value={summary.byStatus?.Payment} icon="credit-card" />
            <StatCard label="Due Reminders" value={summary.dueReminders} icon="bell" />
          </div>
        ) : <p className="muted-text">Loading report summary...</p>}
      </div>

      {summary && (
        <div className="two-col full">
          <div className="panel nested">
            <h4><Icon name="diagram-3" /> Status Breakdown</h4>
            <div className="feature-list">{Object.entries(summary.byStatus || {}).map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div>
          </div>
          <div className="panel nested">
            <h4><Icon name="flag" /> Priority Breakdown</h4>
            <div className="feature-list">{Object.entries(summary.byPriority || {}).map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function App() {
  const [role, setRole] = useState(null);
  const [agent, setAgent] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [form, setForm] = useState(initialForm);
  const [packages, setPackages] = useState([]);
  const [features, setFeatures] = useState([]);
  const [leads, setLeads] = useState([]);
  const [stats, setStats] = useState({});
  const [selectedLead, setSelectedLead] = useState(null);
  const [latestLead, setLatestLead] = useState(null);
  const [recommendation, setRecommendation] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [newStatus, setNewStatus] = useState("Contacted");
  const [authMode, setAuthMode] = useState("login");
  const [agentLogin, setAgentLogin] = useState({ email: "", password: "" });
  const [agentRegister, setAgentRegister] = useState({ name: "", email: "", password: "", confirmPassword: "" });
  const [forgotEmail, setForgotEmail] = useState("");
  const [resetForm, setResetForm] = useState({ token: "", password: "", confirmPassword: "" });
  const [resetLink, setResetLink] = useState("");
  const [availabilityDate, setAvailabilityDate] = useState(localDate());
  const [availability, setAvailability] = useState(null);
  const [bookingValidation, setBookingValidation] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ paymentStatus: "Pending", amountPaid: "", paymentMode: "UPI", receiptNote: "" });
  const [notificationPreview, setNotificationPreview] = useState("");

  const selectedPackage = useMemo(() => packages.find((pkg) => pkg.id === form.preferredPackageId), [form.preferredPackageId, packages]);

  async function loadDashboard() {
    const dashboardData = await api.dashboard();
    setStats(dashboardData.stats || {});
    const query = new URLSearchParams();
    if (search) query.set("search", search);
    if (statusFilter) query.set("status", statusFilter);
    const leadsData = await api.leads(query.toString() ? `?${query.toString()}` : "");
    setLeads(leadsData.leads || []);
  }

  async function loadBaseData() {
    try {
      const packageData = await api.packages();
      setPackages(packageData.packages || []);
      setFeatures(packageData.features || []);
      await loadDashboard();
    } catch (error) {
      setMessage(`Backend connection failed: ${error.message}`);
    }
  }

  useEffect(() => {
    loadBaseData();
    const params = new URLSearchParams(window.location.search);
    const token = params.get("resetToken");
    if (token) {
      setResetForm((current) => ({ ...current, token }));
      setAuthMode("reset");
    }
  }, []);

  function logout() {
    setRole(null);
    setAgent(null);
    setSelectedLead(null);
    setLatestLead(null);
    setRecommendation(null);
    setForm(initialForm);
    setActiveTab("dashboard");
    setMessage("");
  }

  function validateAuthFields(email, password) {
    const loginEmail = String(email || "").trim().toLowerCase();
    const loginPassword = String(password || "");

    if (!isValidGmail(loginEmail)) {
      return "Only Gmail addresses are allowed, example: name@gmail.com";
    }

    if (!isStrongPassword(loginPassword)) {
      return "Password must be at least 6 characters";
    }

    return "";
  }

  async function handleAgentRegister(e) {
    e.preventDefault();
    const registerName = String(agentRegister.name || "").trim();
    const registerEmail = String(agentRegister.email || "").trim().toLowerCase();
    const registerPassword = String(agentRegister.password || "");
    const confirmPassword = String(agentRegister.confirmPassword || "");

    if (!registerName) {
      setMessage("Enter agent name");
      return;
    }

    const validationMessage = validateAuthFields(registerEmail, registerPassword);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    if (registerPassword !== confirmPassword) {
      setMessage("Password and confirm password must match");
      return;
    }

    try {
      setLoading(true);
      const data = await api.agentRegister({ name: registerName, email: registerEmail, password: registerPassword });
      setAgent(data.agent);
      setRole("agent");
      setActiveTab("dashboard");
      setAgentLogin({ email: registerEmail, password: "" });
      setAgentRegister({ name: "", email: "", password: "", confirmPassword: "" });
      setMessage("Agent registered successfully");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAgentLogin(e) {
    e.preventDefault();
    const loginEmail = String(agentLogin.email || "").trim().toLowerCase();
    const loginPassword = String(agentLogin.password || "");

    const validationMessage = validateAuthFields(loginEmail, loginPassword);
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }

    try {
      setLoading(true);
      const data = await api.agentLogin({ email: loginEmail, password: loginPassword });
      setAgent(data.agent);
      setRole("agent");
      setActiveTab("dashboard");
      setMessage("Agent login successful");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }


  async function handleForgotPassword(e) {
    e.preventDefault();
    const email = String(forgotEmail || "").trim().toLowerCase();

    if (!isValidGmail(email)) {
      setMessage("Only Gmail addresses are allowed, example: name@gmail.com");
      return;
    }

    try {
      setLoading(true);
      setResetLink("");
      const data = await api.forgotPassword({ email });
      setMessage(data.message || "Password reset link sent.");
      if (data.resetLink) setResetLink(data.resetLink);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    const token = String(resetForm.token || "").trim();
    const password = String(resetForm.password || "");
    const confirmPassword = String(resetForm.confirmPassword || "");

    if (!token) {
      setMessage("Reset token is required");
      return;
    }

    if (!isStrongPassword(password)) {
      setMessage("Password must be at least 6 characters");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("New password and confirm password must match");
      return;
    }

    try {
      setLoading(true);
      const data = await api.resetPassword({ token, password });
      setMessage(data.message || "Password reset successful. Please login.");
      setResetForm({ token: "", password: "", confirmPassword: "" });
      setResetLink("");
      setAuthMode("login");
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function validateLeadForm() {
    if (!isValidPhone(form.phone)) return "Phone number must contain exactly 10 digits";
    if (form.email && !isValidEmail(form.email)) return "Enter a valid customer email address";
    return "";
  }

  async function handleRecommend() {
    const validationMessage = validateLeadForm();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    try {
      setLoading(true);
      const data = await api.recommend(form);
      setRecommendation(data.recommendation);
      setMessage("Recommendation generated successfully");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAgentLeadSubmit(e) {
    e.preventDefault();
    const validationMessage = validateLeadForm();
    if (validationMessage) {
      setMessage(validationMessage);
      return;
    }
    try {
      setLoading(true);
      const data = await api.createLead({ ...form, source: form.source || "Agent Entry" });
      setMessage(`Lead saved successfully. Lead ID: ${data.id}`);
      setRecommendation(data.lead.recommendation);
      setLatestLead(data.lead);
      setForm(initialForm);
      await loadDashboard();
      setActiveTab("confirmation");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function openLead(id) {
    try {
      setLoading(true);
      const data = await api.getLead(id);
      setSelectedLead(data.lead);
      setLatestLead(data.lead);
      setNewStatus(data.lead.status || "Contacted");
      setActiveTab("details");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateLeadStatus() {
    if (!selectedLead) return;
    try {
      setLoading(true);
      await api.updateStatus(selectedLead.id, { status: newStatus, note: `Changed from dashboard to ${newStatus}` });
      const data = await api.getLead(selectedLead.id);
      setSelectedLead(data.lead);
      setLatestLead(data.lead);
      setMessage("Status updated successfully");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function addFollowup() {
    if (!selectedLead || !followupNote.trim()) {
      setMessage("Enter follow-up note first");
      return;
    }
    try {
      setLoading(true);
      await api.addFollowup(selectedLead.id, { note: followupNote, nextFollowUpDate: selectedLead.nextFollowUpDate });
      const data = await api.getLead(selectedLead.id);
      setSelectedLead(data.lead);
      setLatestLead(data.lead);
      setFollowupNote("");
      setMessage("Follow-up added successfully");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function checkAvailability(dateValue = form.nextFollowUpDate || availabilityDate, excludeLeadId = selectedLead?.id || "") {
    try {
      setLoading(true);
      const data = await api.availability(dateValue, excludeLeadId);
      setAvailability(data);
      setAvailabilityDate(data.date || dateValue);
      setMessage(`Availability checked for ${data.date || dateValue}`);
      return data;
    } catch (error) {
      setMessage(error.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function selectAvailabilitySlot(slot, openLeadEntry = false) {
    if (!slot.available) {
      setMessage(`This slot is already booked by ${slot.bookedBy?.name || "another lead"}`);
      return;
    }
    const selectedDate = availability?.date || availabilityDate || form.nextFollowUpDate;
    setForm((current) => ({ ...current, nextFollowUpDate: selectedDate, preferredSlot: slot.time }));
    if (openLeadEntry) setActiveTab("entry");
    setMessage(`Selected slot ${slot.time} on ${selectedDate}. Complete the Lead Entry form and save.`);
  }

  async function validateCurrentBooking() {
    try {
      setLoading(true);
      const payload = {
        leadId: selectedLead?.id || "",
        nextFollowUpDate: selectedLead?.nextFollowUpDate || form.nextFollowUpDate,
        preferredSlot: selectedLead?.preferredSlot || form.preferredSlot
      };
      const data = await api.validateBooking(payload);
      setBookingValidation(data);
      setMessage(data.message || "Booking validation completed");
    } catch (error) {
      setBookingValidation({ success: false, message: error.message });
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function processSelectedLead() {
    if (!selectedLead) return;
    try {
      setLoading(true);
      const data = await api.processLead(selectedLead.id, selectedLead);
      const refreshed = await api.getLead(selectedLead.id);
      setSelectedLead(refreshed.lead);
      setLatestLead(refreshed.lead);
      setMessage(data.message || "Lead processed successfully");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updatePaymentTracking() {
    if (!selectedLead) return;
    try {
      setLoading(true);
      const data = await api.updatePayment(selectedLead.id, paymentForm);
      setSelectedLead(data.lead);
      setLatestLead(data.lead);
      setMessage("Payment tracking updated successfully");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function previewNotification(type = "followup") {
    if (!selectedLead) return;
    try {
      setLoading(true);
      const data = await api.notificationPreview({ leadId: selectedLead.id, type });
      setNotificationPreview(data.message);
      setMessage("Notification preview generated");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateAutomatedMessages() {
    if (!selectedLead) return;
    try {
      setLoading(true);
      const data = await api.generateAutomatedMessages(selectedLead.id, { trigger: "manual" });
      const refreshed = await api.getLead(selectedLead.id);
      setSelectedLead(refreshed.lead);
      setLatestLead(refreshed.lead);
      setNotificationPreview((data.alerts || []).map((alert) => alert.message).join("\n\n"));
      setMessage(data.message || "Automated messages generated");
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }



  async function deleteLead(id, name = "this lead") {
    try {
      const label = name || "this lead";
      if (!window.confirm(`Delete ${label}? This will also remove related reminders, alerts, payments, documents, and follow-up history.`)) return;
      setLoading(true);
      const data = await api.deleteLead(id);
      setMessage(data.message || "Lead deleted successfully");
      if (selectedLead?.id === id) {
        setSelectedLead(null);
        setLatestLead(null);
        setActiveTab("dashboard");
      }
      await loadDashboard();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteAlert(id) {
    try {
      if (!window.confirm("Delete this notification/reminder?")) return;
      setLoading(true);
      const data = await api.deleteAlert(id);
      setMessage(data.message || "Notification/reminder deleted");
      if (selectedLead?.id) {
        const refreshed = await api.getLead(selectedLead.id);
        setSelectedLead(refreshed.lead);
        setLatestLead(refreshed.lead);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function deleteLeadAlerts(id) {
    try {
      if (!window.confirm("Clear notification/reminder history for this lead?")) return;
      setLoading(true);
      const data = await api.clearLeadAlerts(id);
      setMessage(data.message || "Lead notification/reminder history cleared");
      if (selectedLead?.id === id) {
        const refreshed = await api.getLead(id);
        setSelectedLead(refreshed.lead);
        setLatestLead(refreshed.lead);
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  if (!role) {
    return <LoginPage authMode={authMode} setAuthMode={setAuthMode} agentLogin={agentLogin} setAgentLogin={setAgentLogin} agentRegister={agentRegister} setAgentRegister={setAgentRegister} forgotEmail={forgotEmail} setForgotEmail={setForgotEmail} resetForm={resetForm} setResetForm={setResetForm} onLogin={handleAgentLogin} onRegister={handleAgentRegister} onForgotPassword={handleForgotPassword} onResetPassword={handleResetPassword} loading={loading} message={message} resetLink={resetLink} />;
  }

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} logout={logout} />
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="eyebrow">Agent Follow-up CRM Workflow</span>
            <h1>{activeTab === "entry" ? "Lead Entry" : activeTab === "details" ? "Lead Detail" : activeTab === "confirmation" ? "Confirmation Page" : activeTab === "messages" ? "Message Automation" : activeTab === "reports" ? "Reports" : activeTab === "availability" ? "Availability" : activeTab === "bookings" ? "Admin Booking List" : activeTab === "packages" ? "Land Packages" : "Dashboard"}</h1>
          </div>
          <div className="agent-pill"><Icon name="person-badge" /> {agent?.name || "Sales Agent"}</div>
        </header>
        {message && <div className="toast"><Icon name="info-circle" /> {message}</div>}

        {activeTab === "dashboard" && <Dashboard stats={stats} leads={leads} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} loadDashboard={loadDashboard} openLead={openLead} deleteLead={deleteLead} />}
        {activeTab === "entry" && <LeadEntry form={form} setForm={setForm} packages={packages} selectedPackage={selectedPackage} recommendation={recommendation} loading={loading} handleRecommend={handleRecommend} handleSubmit={handleAgentLeadSubmit} availability={availability} checkAvailability={checkAvailability} selectAvailabilitySlot={selectAvailabilitySlot} />}
        {activeTab === "availability" && <AvailabilityPage availabilityDate={availabilityDate} setAvailabilityDate={setAvailabilityDate} availability={availability} checkAvailability={checkAvailability} selectAvailabilitySlot={selectAvailabilitySlot} />}
        {activeTab === "bookings" && <AdminBookings leads={leads} openLead={openLead} deleteLead={deleteLead} />}
        {activeTab === "confirmation" && <ConfirmationPage latestLead={latestLead} selectedLead={selectedLead} />}
        {activeTab === "messages" && <MessageAutomationPage openLead={openLead} />}
        {activeTab === "packages" && <PackagesPage packages={packages} features={features} />}
        {activeTab === "reports" && <ReportsPage />}
        {activeTab === "details" && selectedLead && <LeadDetails selectedLead={selectedLead} setActiveTab={setActiveTab} newStatus={newStatus} setNewStatus={setNewStatus} updateLeadStatus={updateLeadStatus} followupNote={followupNote} setFollowupNote={setFollowupNote} addFollowup={addFollowup} validateCurrentBooking={validateCurrentBooking} bookingValidation={bookingValidation} processSelectedLead={processSelectedLead} paymentForm={paymentForm} setPaymentForm={setPaymentForm} updatePaymentTracking={updatePaymentTracking} previewNotification={previewNotification} generateAutomatedMessages={generateAutomatedMessages} deleteLead={deleteLead} deleteLeadAlerts={deleteLeadAlerts} deleteAlert={deleteAlert} notificationPreview={notificationPreview} />}
      </main>
    </div>
  );
}
