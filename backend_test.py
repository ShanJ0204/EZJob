#!/usr/bin/env python3
"""
EZJob Backend API Testing Suite
Tests all API endpoints for the AI-Powered Job Matching Platform
"""

import requests
import json
import sys
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
        
    def log(self, message, success=None):
        timestamp = datetime.now().strftime("%H:%M:%S")
        if success is True:
            print(f"[{timestamp}] ✅ {message}")
        elif success is False:
            print(f"[{timestamp}] ❌ {message}")
        else:
            print(f"[{timestamp}] 🔍 {message}")
    
    def run_test(self, name, method, endpoint, expected_status, data=None, auth=True):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if auth:
            headers['Authorization'] = f'Bearer {self.session_token}'
        
        self.tests_run += 1
        self.log(f"Testing {name} - {method} {endpoint}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                self.log(f"PASS - Status: {response.status_code}", True)
                try:
                    resp_data = response.json()
                    if isinstance(resp_data, dict) and len(str(resp_data)) < 200:
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
            error_msg = f"Request timed out after 10 seconds"
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
        """Test GET /api/applications"""
        return self.run_test("Get Applications", "GET", "api/applications", 200)

    def test_match_actions(self):
        """Test match approve/reject actions"""
        # First get matches to find a match to test with
        success, matches_data = self.run_test("Get Matches for Actions", "GET", "api/matches", 200)
        if success and matches_data.get("matches"):
            match_id = matches_data["matches"][0].get("match_id")
            if match_id:
                # Test approve action
                approve_success, approve_data = self.run_test("Match Approve Action", "POST", f"api/matches/{match_id}/action", 200, {"action": "approve"})
                
                # If we have an application, test mark as applied
                if approve_success and approve_data.get("application", {}).get("attempt_id"):
                    attempt_id = approve_data["application"]["attempt_id"]
                    self.run_test("Mark Application Applied", "POST", f"api/applications/{attempt_id}/mark-applied", 200)
                
                return True
            else:
                self.log("⚠️ No match_id found in matches response", False)
                return False
        else:
            self.log("⚠️ No matches found to test actions with")
            return True  # Not a failure, just no data

    def run_all_tests(self):
        """Run all API tests in sequence"""
        self.log("🚀 Starting EZJob Backend API Test Suite")
        self.log("=" * 60)
        
        # Basic health and auth tests
        self.test_health()
        self.test_auth_me_unauthorized()  
        self.test_auth_me_authorized()
        
        # User data tests
        self.test_get_preferences()
        self.test_update_preferences()
        self.test_get_profile()
        self.test_update_profile()
        
        # Dashboard and stats
        self.test_dashboard()
        
        # Job ingestion and matching (these modify data)
        self.test_trigger_ingestion()
        self.test_run_matching()
        
        # Match and application flow
        self.test_get_matches()
        self.test_get_applications()
        self.test_match_actions()
        
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