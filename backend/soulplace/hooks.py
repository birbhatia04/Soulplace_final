app_name = "soulplace"
app_title = "Soulplace"
app_publisher = "ab"
app_description = "test"
app_email = "ab@gmail.com"
app_license = "mit"

# Apps
# ------------------

# required_apps = []

# Show Soulplace in the Frappe Apps launcher. The workspace handles the
# record-level access checks for the selected Desk user.
add_to_apps_screen = [
	{
		"name": "soulplace",
		"logo": "/assets/soulplace/images/soulplace.svg",
		"title": "Soulplace",
		"route": "/app/soulplace",
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/soulplace/css/soulplace.css"
# app_include_js = "/assets/soulplace/js/soulplace.js"

# include js, css files in header of web template
# web_include_css = "/assets/soulplace/css/soulplace.css"
# web_include_js = "/assets/soulplace/js/soulplace.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "soulplace/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "soulplace/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "soulplace.utils.jinja_methods",
# 	"filters": "soulplace.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "soulplace.install.before_install"
# after_install = "soulplace.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "soulplace.uninstall.before_uninstall"
# after_uninstall = "soulplace.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "soulplace.utils.before_app_install"
# after_app_install = "soulplace.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "soulplace.utils.before_app_uninstall"
# after_app_uninstall = "soulplace.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "soulplace.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
	"SoulPlace Appointment": "soulplace.permissions.appointment_query",
	"Appointment Audit Timeline": "soulplace.permissions.appointment_audit_query",
	"Consultation": "soulplace.permissions.consultation_query",
	"Doctor": "soulplace.permissions.doctor_query",
	"Doctor Schedule Exception": "soulplace.permissions.schedule_exception_query",
	"Patient Consent Record": "soulplace.permissions.consent_query",
	"PatientUser": "soulplace.permissions.patient_query",
	"Prescription": "soulplace.permissions.prescription_query",
	"Teleconsult Session": "soulplace.permissions.teleconsult_query",
}

has_permission = {
	"SoulPlace Appointment": "soulplace.permissions.has_document_permission",
	"Appointment Audit Timeline": "soulplace.permissions.has_document_permission",
	"Consultation": "soulplace.permissions.has_document_permission",
	"Doctor": "soulplace.permissions.has_document_permission",
	"Doctor Schedule Exception": "soulplace.permissions.has_document_permission",
	"Patient Consent Record": "soulplace.permissions.has_document_permission",
	"PatientUser": "soulplace.permissions.has_document_permission",
	"Prescription": "soulplace.permissions.has_document_permission",
	"Teleconsult Session": "soulplace.permissions.has_document_permission",
}

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"SoulPlace Appointment": {
		"validate": "soulplace.events.validate_appointment",
		"after_insert": "soulplace.events.after_insert_appointment",
		"on_update": "soulplace.events.on_update_appointment"
	},
	"Teleconsult Session": {
		"validate": "soulplace.events.validate_teleconsult"
	}
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"soulplace.tasks.all"
# 	],
# 	"daily": [
# 		"soulplace.tasks.daily"
# 	],
# 	"hourly": [
# 		"soulplace.tasks.hourly"
# 	],
# 	"weekly": [
# 		"soulplace.tasks.weekly"
# 	],
# 	"monthly": [
# 		"soulplace.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "soulplace.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "soulplace.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "soulplace.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["soulplace.utils.before_request"]
# after_request = ["soulplace.utils.after_request"]

# Job Events
# ----------
# before_job = ["soulplace.utils.before_job"]
# after_job = ["soulplace.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"soulplace.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

# Fixtures
# --------
# Export Custom Fields and Roles so they sync automatically via bench migrate
fixtures = [
	{"dt": "Custom Field", "filters": [["dt", "=", "SoulPlace Appointment"]]},
	{"dt": "Role", "filters": [["name", "in", ["Patient App User", "Doctor App User"]]]},
]
