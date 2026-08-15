import hashlib
import hmac
import secrets
from urllib.parse import parse_qs, urlencode, urlparse

import frappe
from frappe import _
from frappe.auth import LoginManager
from frappe.rate_limiter import rate_limit
from frappe.utils import cint, now, validate_email_address

PATIENT_ROLE = "Patient App User"
PATIENT_EMAIL_DOMAIN = "soulplace.local"
PATIENT_GENDERS = {"Male", "Female"}
PATIENT_LANGUAGES = {"English", "Hindi", "Marathi"}
PATIENT_THERAPY_EXPERIENCE = {
    "New to therapy",
    "Some previous experience",
    "Currently in therapy",
}
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def _normalize_phone(phoneno):
    normalized = "".join(character for character in str(phoneno or "") if character.isdigit())
    if len(normalized) == 12 and normalized.startswith("91"):
        normalized = normalized[2:]
    return normalized


def _clean_text(value, maximum, label="Value"):
    cleaned = " ".join(str(value or "").strip().split())
    if len(cleaned) > maximum:
        frappe.throw(_("{0} must be {1} characters or fewer").format(label, maximum))
    return cleaned


def _boolean(value, label):
    if value in (True, 1, "1", "true", "True"):
        return 1
    if value in (False, 0, "0", "false", "False", "", None):
        return 0
    frappe.throw(_("{0} must be true or false").format(label))


def _validate_password(password):
    password = str(password or "")
    if len(password) < PASSWORD_MIN_LENGTH:
        frappe.throw(_("Password must contain at least 8 characters"))
    if len(password) > PASSWORD_MAX_LENGTH:
        frappe.throw(_("Password must be 128 characters or fewer"))
    return password


def _contact_email(value):
    email = str(value or "").strip().lower()
    if len(email) > 254 or not validate_email_address(email):
        frappe.throw(_("Enter a valid email address"))
    return email


def _frontend_password_reset_link(frappe_reset_link):
    reset_key = (parse_qs(urlparse(frappe_reset_link).query).get("key") or [""])[0]
    if not reset_key:
        raise ValueError("Frappe did not generate a password reset key")
    frontend_url = str(frappe.conf.get("frontend_url") or "").strip().rstrip("/")
    if not frontend_url:
        from frappe.utils import get_url

        frontend_url = get_url().rstrip("/")
    return f"{frontend_url}/patient/reset-password?{urlencode({'key': reset_key})}"


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="email", limit=5, seconds=60 * 60, methods="POST")
def request_patient_password_reset(email):
    """Send an enumeration-safe reset link to a patient's contact email."""
    contact_email = _contact_email(email)
    response = {"sent": True}

    try:
        patient = frappe.db.get_value(
            "PatientUser",
            {"email": contact_email},
            ["name", "name1", "app_user"],
            as_dict=True,
        )
        if not patient or not patient.app_user:
            return response

        user = frappe.get_doc("User", patient.app_user)
        if not user.enabled or PATIENT_ROLE not in frappe.get_roles(user.name):
            return response

        reset_link = _frontend_password_reset_link(user._reset_password(send_email=False))
        frappe.sendmail(
            recipients=[contact_email],
            subject=_("Password Reset"),
            template="password_reset",
            args={
                "first_name": patient.name1 or user.first_name or _("Patient"),
                "last_name": "",
                "link": reset_link,
                "created_by": "SoulPlace",
            },
            add_unsubscribe_link=0,
            now=True,
            retry=3,
            is_notification=True,
            redact_message_after_send=True,
        )
    except Exception:
        frappe.clear_messages()
        frappe.log_error(
            title="Patient password reset email could not be sent",
            message=frappe.get_traceback(),
        )

    return response


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60, methods="POST")
def validate_patient_password_reset_key(key):
    """Return whether a patient reset key is valid without consuming it."""
    reset_key = str(key or "").strip()
    if not reset_key:
        return {"valid": False}

    from frappe.core.doctype.user.user import _get_user_for_update_password

    result = _get_user_for_update_password(reset_key, None)
    user = result.get("user")
    if result.get("message") or not user:
        return {"valid": False}
    if PATIENT_ROLE not in frappe.get_roles(user):
        return {"valid": False}

    return {"valid": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="usr", limit=10, seconds=15 * 60, methods="POST")
def patient_login(usr=None, pwd=None):
    if not (usr and pwd):
        frappe.throw(_("Username and password are required"), frappe.AuthenticationError)

    login_id = str(usr).strip().lower()
    if "@" in login_id and not login_id.endswith(f"@{PATIENT_EMAIL_DOMAIN}"):
        login_id = (
            frappe.db.get_value("PatientUser", {"email": login_id}, "app_user")
            or login_id
        )

    login_manager = LoginManager()
    login_manager.authenticate(user=login_id, pwd=pwd)

    if PATIENT_ROLE not in frappe.get_roles(login_manager.user):
        frappe.throw(_("This account does not have patient portal access"), frappe.AuthenticationError)

    phoneno = login_manager.user.split("@", 1)[0] if "@" in login_manager.user else login_manager.user
    patient_name = frappe.db.get_value("PatientUser", {"app_user": login_manager.user}, "name")
    if not patient_name:
        patient_name = frappe.db.get_value("PatientUser", {"phoneno": phoneno}, "name")
    if not patient_name and frappe.db.exists("PatientUser", login_manager.user):
        patient_name = login_manager.user

    if not patient_name:
        frappe.throw(_("This account is not linked to a patient profile"), frappe.AuthenticationError)

    login_manager.post_login()
    patient_doc = frappe.get_doc("PatientUser", patient_name)
    patient_user = {
        "name": patient_doc.name,
        "phoneno": patient_doc.phoneno or "",
        "email": patient_doc.email,
        "first_name": getattr(patient_doc, "name1", ""),
        "age": patient_doc.age,
        "gender": patient_doc.gender,
    }

    return {
        "success": True,
        "user": {
            "name": login_manager.user,
            "full_name": login_manager.full_name,
        },
        "patient": patient_user,
    }


@frappe.whitelist(methods=["POST"])
def get_user_details():
    from soulplace.permissions import current_patient

    if frappe.session.user == "Guest" or PATIENT_ROLE not in frappe.get_roles():
        frappe.throw(_("Patient access is required"), frappe.PermissionError)
    patient_name = current_patient()
    if not patient_name:
        frappe.throw(_("A linked patient profile is required"), frappe.PermissionError)
    user = frappe.get_doc("PatientUser", patient_name)
    return {
        "phoneno": user.phoneno,
        "email": user.email,
        "name1": user.name1,
        "age": user.age,
        "gender": user.gender,
        "livingstatus": user.livingstatus,
        "therapyexp": user.therapyexp,
        "app_user": user.app_user,
        "preferred_language": user.preferred_language,
        "emergency_contact_name": user.emergency_contact_name,
        "emergency_contact_phone": user.emergency_contact_phone,
        "consent_status": user.consent_status,
    }


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=60 * 60, methods="POST")
def register_patient(
    email,
    password,
    name1,
    age,
    gender,
    livingstatus,
    therapyexp,
    preferred_language,
    phoneno="",
    emergency_contact_name="",
    emergency_contact_phone="",
    consent_accepted=False,
    consent_version="1.0",
):
    normalized_phone = _normalize_phone(phoneno)
    contact_email = _contact_email(email)
    patient_name = _clean_text(name1, 140, "Name")
    password = _validate_password(password)
    if not patient_name:
        frappe.throw(_("Name, email, and password are required"))
    if len(patient_name) < 2:
        frappe.throw(_("Name must contain at least 2 characters"))
    if normalized_phone and len(normalized_phone) != 10:
        frappe.throw(_("Enter a valid 10-digit Indian phone number"))
    if gender not in PATIENT_GENDERS:
        frappe.throw(_("Gender must be Male or Female"))
    if preferred_language not in PATIENT_LANGUAGES:
        frappe.throw(_("Select a supported preferred language"))
    if therapyexp not in PATIENT_THERAPY_EXPERIENCE:
        frappe.throw(_("Select a supported therapy experience"))
    try:
        age_number = float(age)
    except (TypeError, ValueError):
        frappe.throw(_("Age must be a whole number between 13 and 120"))
    if not age_number.is_integer() or age_number < 13 or age_number > 120:
        frappe.throw(_("Age must be between 13 and 120"))
    age_value = int(age_number)
    if not _boolean(consent_accepted, "Consent acceptance"):
        frappe.throw(_("Privacy and treatment consent is required"))

    version = _clean_text(consent_version, 50, "Consent version") or "1.0"

    emergency_phone = _normalize_phone(emergency_contact_phone)
    if emergency_phone and len(emergency_phone) != 10:
        frappe.throw(_("Enter a valid 10-digit emergency contact phone number"))

    login_email = contact_email

    if frappe.db.exists("User", login_email):
        frappe.throw(_("User with this email already exists"))
    if normalized_phone and frappe.db.exists("PatientUser", {"phoneno": normalized_phone}):
        frappe.throw(_("A patient profile with this phone number already exists"))
    if frappe.db.exists("PatientUser", {"email": contact_email}):
        frappe.throw(_("A patient profile with this email already exists"))

    user_values = {
        "doctype": "User",
        "email": login_email,
        "first_name": patient_name,
        "send_welcome_email": 0,
        "user_type": "Website User",
    }
    if normalized_phone:
        user_values["mobile_no"] = normalized_phone
    user = frappe.get_doc(user_values)
    user.insert(ignore_permissions=True)
    user.add_roles(PATIENT_ROLE)

    from frappe.utils.password import update_password
    update_password(user.name, password)

    if livingstatus == "With family":
        livingstatus_val = 1
    elif livingstatus == "Living alone":
        livingstatus_val = 0
    else:
        livingstatus_val = _boolean(livingstatus, "Living status")

    patient_values = {
        "doctype": "PatientUser",
        "email": contact_email,
        "name1": patient_name,
        "age": age_value,
        "gender": gender,
        "livingstatus": livingstatus_val,
        "therapyexp": therapyexp,
        "app_user": user.name,
        "mobile_no_verified": 0,
        "preferred_language": preferred_language,
        "emergency_contact_name": _clean_text(
            emergency_contact_name, 140, "Emergency contact name"
        ),
        "emergency_contact_phone": emergency_phone,
        "consent_status": "Granted",
    }
    if normalized_phone:
        patient_values["phoneno"] = normalized_phone
    patient = frappe.get_doc(patient_values)
    patient.insert(ignore_permissions=True)

    request_ip = getattr(frappe.local, "request_ip", "") or ""
    for consent_type in ("Privacy", "Treatment"):
        frappe.get_doc({
            "doctype": "Patient Consent Record",
            "patient": patient.name,
            "consent_type": consent_type,
            "consent_version": version,
            "status": "Granted",
            "granted_on": now(),
            "capture_source": "Web",
            "ip_address": request_ip,
        }).insert(ignore_permissions=True)

    return patient_login(usr=login_email, pwd=password)


OTP_TTL_SECONDS = 5 * 60
OTP_MAX_ATTEMPTS = 5


def _otp_key(phone, purpose):
    return f"soulplace:patient-otp:{purpose}:{phone}"


def _otp_digest(phone, purpose, code):
    site = getattr(frappe.local, "site", "") or "soulplace"
    return hashlib.sha256(f"{site}:{phone}:{purpose}:{code}".encode()).hexdigest()


def _patient_for_phone(phone):
    return frappe.db.get_value(
        "PatientUser", {"phoneno": phone}, ["name", "app_user"], as_dict=True
    )


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="phoneno", limit=5, seconds=15 * 60, methods="POST")
def request_patient_otp(phoneno, purpose="login"):
    """Send an enumeration-safe, five-minute OTP through Frappe SMS Settings."""
    if purpose not in {"login", "reset"}:
        frappe.throw(_("Unsupported OTP purpose"))
    phone = _normalize_phone(phoneno)
    if len(phone) != 10:
        # Return the same response shape as a registered number.
        return {"sent": True, "expires_in": OTP_TTL_SECONDS}

    patient = _patient_for_phone(phone)
    if not patient or not patient.app_user:
        return {"sent": True, "expires_in": OTP_TTL_SECONDS}

    code = f"{secrets.randbelow(1_000_000):06d}"
    key = _otp_key(phone, purpose)
    frappe.cache.set_value(
        key,
        {"digest": _otp_digest(phone, purpose, code), "attempts": 0},
        expires_in_sec=OTP_TTL_SECONDS,
    )
    try:
        from frappe.core.doctype.sms_settings.sms_settings import send_sms

        send_sms([phone], _("Your SoulPlace verification code is {0}. It expires in 5 minutes.").format(code))
    except Exception:
        frappe.cache.delete_value(key)
        frappe.log_error(title="Patient OTP delivery failed", message=frappe.get_traceback())

    # Never reveal whether the patient exists or whether SMS delivery was configured.
    return {"sent": True, "expires_in": OTP_TTL_SECONDS}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(key="phoneno", limit=10, seconds=15 * 60, methods="POST")
def verify_patient_otp(phoneno, otp, purpose="login", new_password=None):
    if purpose not in {"login", "reset"}:
        frappe.throw(_("Unsupported OTP purpose"))
    phone = _normalize_phone(phoneno)
    key = _otp_key(phone, purpose)
    state = frappe.cache.get_value(key)
    if isinstance(state, str):
        state = frappe.parse_json(state)
    if not state or not isinstance(state, dict):
        frappe.throw(_("The code is invalid or has expired"), frappe.AuthenticationError)

    attempts = cint(state.get("attempts")) + 1
    expected = str(state.get("digest") or "")
    actual = _otp_digest(phone, purpose, str(otp or "").strip())
    if not hmac.compare_digest(expected, actual):
        if attempts >= OTP_MAX_ATTEMPTS:
            frappe.cache.delete_value(key)
        else:
            state["attempts"] = attempts
            frappe.cache.set_value(key, state, expires_in_sec=OTP_TTL_SECONDS)
        frappe.throw(_("The code is invalid or has expired"), frappe.AuthenticationError)

    patient = _patient_for_phone(phone)
    if not patient or not patient.app_user:
        frappe.cache.delete_value(key)
        frappe.throw(_("The code is invalid or has expired"), frappe.AuthenticationError)
    frappe.cache.delete_value(key)
    frappe.db.set_value("PatientUser", patient.name, "mobile_no_verified", 1, update_modified=False)

    if purpose == "reset":
        new_password = _validate_password(new_password)
        from frappe.utils.password import update_password

        update_password(patient.app_user, new_password, logout_all_sessions=True)
        return {"success": True, "password_reset": True}

    LoginManager().login_as(patient.app_user)
    patient_doc = frappe.get_doc("PatientUser", patient.name)
    return {
        "success": True,
        "user": {
            "name": patient.app_user,
            "full_name": frappe.db.get_value("User", patient.app_user, "full_name") or patient_doc.name1,
        },
        "patient": {
            "name": patient_doc.name,
            "phoneno": patient_doc.phoneno,
            "first_name": patient_doc.name1,
            "age": patient_doc.age,
            "gender": patient_doc.gender,
        },
    }
