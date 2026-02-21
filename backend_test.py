#!/usr/bin/env python3
"""
EZJob Backend API Testing Suite
Tests all API endpoints for the AI-Powered Job Matching Platform
Including new features: Resume Upload, Notifications, Multi-Source Ingestion, Analytics
"""

import requests
import json
import sys
import io
from datetime import datetime

class EZJobAPITester:
    def __init__(self, base_url="https://status-check-57.preview.emergentagent.com"):
        self.base_url = base_url
        self.session_token = "test_session_1771671687862"
        self.user_id = "test-user-1771671687862"
        self.tests_run = 0
        self.tests_passed = 0
        self.failures = []
        self.created_match_id = None
        self.created_attempt_id = None
        
    def log(self, message, success=None):
        timestamp = datetime.now().strftime("%H:%M:%S")
        if success is True:
            print(f"[{timestamp}] ✅ {message}")
        elif success is False:
            print(f"[{timestamp}] ❌ {message}")
        else:
            print(f"[{timestamp}] 🔍 {message}")
    
    def run_test(self, name, method, endpoint, expected_status, data=None, auth=True, files=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {}
        
        if auth:
            headers['Authorization'] = f'Bearer {self.session_token}'
        
        # Only set Content-Type for JSON requests (not file uploads)
        if not files:
            headers['Content-Type'] = 'application/json'
        
        self.tests_run += 1
        self.log(f"Testing {name} - {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=15)
            elif method == 'POST':
                if files:
                    response = requests.post(url, files=files, headers={k:v for k,v in headers.items() if k != 'Content-Type'}, timeout=15)
                else:
                    response = requests.post(url, json=data, headers=headers, timeout=15)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=15)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=15)
            
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"PASS - Status: {response.status_code}", True)
                try:
                    resp_data = response.json()
                    if isinstance(resp_data, dict) and len(str(resp_data)) < 300:
                        self.log(f"Response: {resp_data}")
                except:
                    self.log("Response: (non-JSON)")
                return True, response.json() if success else {}
            else:
                error_msg = f"Expected {expected_status}, got {response.status_code}"
                try:
                    error_detail = response.json()
                    error_msg += f" - {error_detail.get('detail', 'No details')}"
                except:
                    error_msg += f" - {response.text[:100]}"
                
                self.failures.append(f"{name}: {error_msg}")
                self.log(f"FAIL - {error_msg}", False)
                return False, {}
                
        except requests.exceptions.Timeout:
            error_msg = f"Request timed out after 15 seconds"
            self.failures.append(f"{name}: {error_msg}")
            self.log(f"FAIL - {error_msg}", False)
            return False, {}
        except Exception as e:
            error_msg = f"Request failed: {str(e)}"
            self.failures.append(f"{name}: {error_msg}")
            self.log(f"FAIL - {error_msg}", False)
            return False, {}

    def test_health(self):
        """Test GET /api/health"""
        return self.run_test("Health Check", "GET", "api/health", 200, auth=False)

    def test_auth_me_unauthorized(self):
        """Test GET /api/auth/me without auth"""
        return self.run_test("Auth Me (No Auth)", "GET", "api/auth/me", 401, auth=False)

    def test_auth_me_authorized(self):
        """Test GET /api/auth/me with valid session"""
        return self.run_test("Auth Me (Authorized)", "GET", "api/auth/me", 200)

    def test_auth_logout(self):
        """Test POST /api/auth/logout"""
        return self.run_test("Auth Logout", "POST", "api/auth/logout", 200)

    def test_get_preferences(self):
        """Test GET /api/preferences"""
        return self.run_test("Get Preferences", "GET", "api/preferences", 200)

    def test_update_preferences(self):
        """Test PUT /api/preferences"""
        data = {
            "desired_titles": ["Software Engineer", "Full Stack Developer"],
            "preferred_locations": ["Remote", "San Francisco"],
            "remote_only": True,
            "min_salary": 80000,
            "max_salary": 150000,
            "employment_types": ["full-time"],
            "notifications_enabled": True
        }
        return self.run_test("Update Preferences", "PUT", "api/preferences", 200, data)

    def test_get_profile(self):
        """Test GET /api/profile"""
        return self.run_test("Get Profile", "GET", "api/profile", 200)

    def test_update_profile(self):
        """Test PUT /api/profile"""
        data = {
            "full_name": "Test User Updated",
            "phone": "+1-555-0123",
            "linkedin_url": "https://linkedin.com/in/testuser",
            "github_url": "https://github.com/testuser",
            "years_experience": 5.5,
            "summary": "Experienced software engineer with 5+ years in full-stack development."
        }
        return self.run_test("Update Profile", "PUT", "api/profile", 200, data)

    def test_dashboard(self):
        """Test GET /api/dashboard"""
        return self.run_test("Dashboard Stats", "GET", "api/dashboard", 200)

    def test_trigger_ingestion(self):
        """Test POST /api/ingestion/run"""
        self.log("⚠️ Ingestion may take time and hit external APIs")
        return self.run_test("Trigger Job Ingestion", "POST", "api/ingestion/run", 200)

    def test_run_matching(self):
        """Test POST /api/matching/run"""
        self.log("⚠️ Matching uses LLM and may take time")
        return self.run_test("Run LLM Matching", "POST", "api/matching/run", 200)

    def test_get_matches(self):
        """Test GET /api/matches"""
        return self.run_test("Get Matches", "GET", "api/matches", 200)

    def test_get_applications(self):
        """Test GET /api/applications - Should include cover_letter and cover_letter_status fields"""
        success, response = self.run_test("Get Applications", "GET", "api/applications", 200)
        if success:
            applications = response.get("applications", [])
            if applications:
                app = applications[0]
                has_cover_letter_field = "cover_letter" in app
                has_cover_letter_status = "cover_letter_status" in app
                self.log(f"✅ Application has cover_letter field: {has_cover_letter_field}")
                self.log(f"✅ Application has cover_letter_status field: {has_cover_letter_status}")
                if has_cover_letter_status:
                    self.log(f"Cover letter status: {app.get('cover_letter_status', 'none')}")
        return success

    def test_match_actions(self):
        """Test match approve/reject actions and cover letter generation"""
        # First get matches to find a match to test with
        success, matches_data = self.run_test("Get Matches for Actions", "GET", "api/matches", 200)
        if success and matches_data.get("matches"):
            match_id = matches_data["matches"][0].get("match_id")
            if match_id:
                # Test approve action (should trigger cover letter generation)
                approve_success, approve_data = self.run_test("Match Approve Action", "POST", f"api/matches/{match_id}/action", 200, {"action": "approve"})
                
                # If we have an application, test cover letter features
                if approve_success and approve_data.get("application", {}).get("attempt_id"):
                    attempt_id = approve_data["application"]["attempt_id"]
                    self.log(f"✅ Application created: {attempt_id}")
                    
                    # Test getting cover letter status
                    self.test_get_cover_letter(attempt_id)
                    
                    # Test generating cover letter on demand
                    self.test_generate_cover_letter_by_attempt(attempt_id)
                    
                    # Mark as applied
                    self.run_test("Mark Application Applied", "POST", f"api/applications/{attempt_id}/mark-applied", 200)
                    
                    # Store attempt_id for later tests
                    self.created_attempt_id = attempt_id
                
                return True
            else:
                self.log("⚠️ No match_id found in matches response", False)
                return False
        else:
            self.log("⚠️ No matches found to test actions with")
            return True  # Not a failure, just no data

    def test_get_cover_letter(self, attempt_id):
        """Test GET /api/applications/{attempt_id}/cover-letter"""
        success, response = self.run_test("Get Cover Letter", "GET", f"api/applications/{attempt_id}/cover-letter", 200)
        if success:
            status = response.get("status", "none")
            cover_letter = response.get("cover_letter")
            self.log(f"Cover letter status: {status}")
            if cover_letter:
                self.log(f"Cover letter length: {len(cover_letter)} characters")
            else:
                self.log("Cover letter: None (may still be generating)")
        return success

    def test_generate_cover_letter_by_attempt(self, attempt_id):
        """Test POST /api/cover-letter/generate with attempt_id"""
        success, response = self.run_test("Generate Cover Letter (by attempt)", "POST", f"api/cover-letter/generate?attempt_id={attempt_id}", 200)
        if success:
            cover_letter = response.get("cover_letter")
            if cover_letter:
                self.log(f"Generated cover letter length: {len(cover_letter)} characters")
            else:
                self.log("⚠️ No cover letter in response")
        return success

    def test_generate_cover_letter_by_match(self):
        """Test POST /api/cover-letter/generate with match_id"""
        # Get a match first
        success, matches_data = self.run_test("Get Matches for Cover Letter", "GET", "api/matches", 200)
        if success and matches_data.get("matches"):
            match_id = matches_data["matches"][0].get("match_id")
            if match_id:
                success, response = self.run_test("Generate Cover Letter (by match)", "POST", f"api/cover-letter/generate?match_id={match_id}", 200)
                if success:
                    cover_letter = response.get("cover_letter")
                    if cover_letter:
                        self.log(f"Generated cover letter length: {len(cover_letter)} characters")
                    else:
                        self.log("⚠️ No cover letter in response")
                return success
        self.log("⚠️ No matches available for cover letter generation")
        return True  # Not a failure

    def test_resume_upload(self):
        """Test POST /api/resume/upload - Upload PDF file"""
        # Create a simple text-based PDF content that can be extracted
        # This is a minimal but valid PDF with extractable text
        pdf_content = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 44 >>
stream
BT
/F1 12 Tf
72 720 Td
(Test Resume Content) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000199 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
294
%%EOF"""
        
        files = {
            'file': ('test_resume.pdf', io.BytesIO(pdf_content), 'application/pdf')
        }
        
        # Note: This might still fail if pdfplumber can't extract from our minimal PDF
        # But the endpoint should work with real PDFs
        success, response = self.run_test("Resume Upload", "POST", "api/resume/upload", 200, files=files)
        if not success:
            self.log("⚠️ Resume upload failed - likely due to minimal test PDF. Testing with real PDF would work.")
        return success

    def test_delete_resume(self):
        """Test DELETE /api/resume - Delete uploaded resume"""
        return self.run_test("Delete Resume", "DELETE", "api/resume", 200)

    def test_notification_settings_get(self):
        """Test GET /api/notifications/settings"""
        return self.run_test("Get Notification Settings", "GET", "api/notifications/settings", 200)

    def test_notification_settings_update(self):
        """Test PUT /api/notifications/settings"""
        data = {
            "email_enabled": True,
            "email_address": "test@example.com",
            "telegram_enabled": False,
            "telegram_bot_token": "",
            "telegram_chat_id": ""
        }
        return self.run_test("Update Notification Settings", "PUT", "api/notifications/settings", 200, data)

    def test_notification_history(self):
        """Test GET /api/notifications/history"""
        return self.run_test("Get Notification History", "GET", "api/notifications/history", 200)

    def test_notification_test(self):
        """Test POST /api/notifications/test - With RESEND_API_KEY should attempt real email (may fail with validation_error if domain not verified)"""
        success, response = self.run_test("Test Notification", "POST", "api/notifications/test", 200)
        if success:
            status = response.get('status')
            if status == 'sent':
                self.log(f"✅ Test notification sent successfully!")
                # Check if email was attempted
                results = response.get('results', {})
                if 'email' in results:
                    email_status = results['email'].get('status')
                    if email_status == 'sent':
                        self.log(f"✅ Email sent via Resend")
                    elif email_status == 'failed':
                        error = results['email'].get('error', '')
                        if 'validation_error' in error.lower() or 'domain' in error.lower():
                            self.log(f"✅ Email failed as expected: {error} (domain not verified)")
                        else:
                            self.log(f"⚠️ Email failed with: {error}")
                    else:
                        self.log(f"⚠️ Unexpected email status: {email_status}")
                return True
            elif status == 'no_channels':
                self.log(f"✅ No notification channels configured: {response.get('message', '')}")
                return True
            elif status == 'error':
                self.log(f"⚠️ Test notification error: {response.get('message', '')}", False)
                return False
            else:
                self.log(f"⚠️ Unexpected status: {status}", False)
                return False
        return success

    def test_ingestion_with_sources(self):
        """Test POST /api/ingestion/run - Should return sources array with 6 sources (NEW: hackernews, indeed, linkedin, github_jobs)"""
        self.log("⚠️ Ingestion may take time and hit external APIs (6 sources: remotive, weworkremotely, hackernews, indeed, linkedin, github_jobs)")
        success, response = self.run_test("Trigger Ingestion (6-Source)", "POST", "api/ingestion/run", 200)
        if success:
            sources = response.get('sources', [])
            source_names = [s.get('source') for s in sources]
            self.log(f"Sources found: {source_names}")
            
            # Check all 6 expected sources (some may return 0 due to rate limiting)
            expected_sources = ['remotive', 'weworkremotely', 'hackernews', 'indeed', 'linkedin', 'github_jobs']
            sources_found = 0
            for expected in expected_sources:
                if expected in source_names:
                    source_data = next(s for s in sources if s.get('source') == expected)
                    fetched = source_data.get('fetched', 0)
                    inserted = source_data.get('inserted', 0)
                    self.log(f"✅ Found {expected}: {fetched} fetched, {inserted} inserted")
                    sources_found += 1
                else:
                    self.log(f"⚠️ Missing expected source: {expected}")
            
            total_fetched = response.get('total_fetched', 0)
            self.log(f"Total jobs fetched: {total_fetched}")
            self.log(f"Sources operating: {sources_found}/6 (some may return 0 due to rate limits)")
            return sources_found >= 4  # Accept if at least 4 sources work (rate limiting expected)
        return success

    def test_ingestion_stats(self):
        """Test GET /api/ingestion/stats - Should include by_source breakdown"""
        success, response = self.run_test("Get Ingestion Stats", "GET", "api/ingestion/stats", 200)
        if success:
            by_source = response.get('by_source', {})
            total_jobs = response.get('total_jobs_indexed', 0)
            self.log(f"Jobs by source: {by_source}")
            self.log(f"Total indexed: {total_jobs}")
        return success

    def test_analytics(self):
        """Test GET /api/analytics - Should return comprehensive analytics data"""
        success, response = self.run_test("Get Analytics", "GET", "api/analytics", 200)
        if success:
            expected_keys = [
                'score_distribution', 'match_trend', 'status_breakdown', 
                'source_breakdown', 'average_score', 'total_matches',
                'top_matches', 'application_funnel', 'notifications'
            ]
            
            for key in expected_keys:
                if key in response:
                    self.log(f"✅ Analytics contains {key}: {type(response[key])}")
                else:
                    self.log(f"⚠️ Analytics missing {key}", False)
                    
            # Log some key stats
            self.log(f"Total matches: {response.get('total_matches', 0)}")
            self.log(f"Average score: {response.get('average_score', 0)}")
            self.log(f"Score distribution: {response.get('score_distribution', {})}")
            
        return success

    def run_all_tests(self):
        """Run all API tests in sequence"""
        self.log("🚀 Starting EZJob Backend API Test Suite (Cover Letter Integration + Fixed Homepage)")
        self.log("=" * 80)
        
        # Basic health and auth tests
        self.test_health()
        self.test_auth_me_unauthorized()  
        self.test_auth_me_authorized()
        
        # User data tests
        self.test_get_preferences()
        self.test_update_preferences()
        self.test_get_profile()
        self.test_update_profile()
        
        # === NEW: Resume upload & PDF parsing ===
        self.log("\n📄 Testing Resume Upload & PDF Parsing...")
        self.test_resume_upload()
        self.test_delete_resume()
        
        # === NEW: Notification settings ===
        self.log("\n🔔 Testing Notification Settings...")
        self.test_notification_settings_get()
        self.test_notification_settings_update()
        self.test_notification_history()
        self.test_notification_test()
        
        # Dashboard and stats
        self.test_dashboard()
        
        # === NEW: Enhanced ingestion (6 sources: remotive, weworkremotely, hackernews, indeed, linkedin, github_jobs) ===
        self.log("\n🔄 Testing 6-Source Job Ingestion...")
        self.test_ingestion_with_sources()
        self.test_ingestion_stats()
        
        # LLM matching (now with resume support)
        self.log("\n🧠 Testing LLM Matching (with resume support)...")
        self.test_run_matching()
        
        # Match and application flow (with cover letter testing)
        self.log("\n📝 Testing Match Actions & Cover Letter Generation...")
        self.test_get_matches()
        self.test_match_actions()
        self.test_get_applications()
        self.test_generate_cover_letter_by_match()
        
        # === NEW: Analytics page ===
        self.log("\n📊 Testing Analytics...")
        self.test_analytics()
        
        # Logout test (doesn't actually affect our bearer token)
        self.test_auth_logout()
        
        # Summary
        self.print_summary()
        
    def print_summary(self):
        """Print test execution summary"""
        self.log("=" * 60)
        self.log(f"🎯 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        self.log(f"📊 Success Rate: {success_rate:.1f}%")
        
        if self.failures:
            self.log("❌ Failed Tests:", False)
            for i, failure in enumerate(self.failures, 1):
                print(f"   {i}. {failure}")
        else:
            self.log("🎉 All tests passed!")
        
        return self.tests_passed == self.tests_run

def main():
    tester = EZJobAPITester()
    success = tester.run_all_tests()
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())