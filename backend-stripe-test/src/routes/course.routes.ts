import { Router } from "express";
import {
  getRobotLabAccess,
  getRobotLabNginxAuth,
  getRobotLabNginxProfessionalAuth,
  postRobotLabAssistant,
  postRobotLabCheckout,
} from "../controllers/course.controller";
import { authRequired } from "../middleware/auth.middleware";
import { courseAdminRequired, courseAuthRequired } from "../middleware/course-auth.middleware";
import {
  courseUploadSingle,
  deleteCourseSession,
  downloadCourseSubmission,
  getCourseAdmin,
  getCourseState,
  patchCourseAdminSubmission,
  patchCourseProgress,
  postCourseAdminGrant,
  postCourseAdminRevoke,
  postCourseConsent,
  postCourseSession,
  postCourseSubmission,
} from "../controllers/course-campus.controller";
import {
  downloadCourseCertificate,
  getCourseAdminOperations,
  getCourseCertificate,
  getCourseCertificateVerification,
  getCourseCheckoutStatus,
  getCourseSupport,
  patchCourseAdminSupport,
  postCourseAnalytics,
  postCourseCertificate,
  postCoursePasswordChange,
  postCourseStripeWebhook,
  postCourseSupport,
} from "../controllers/course-operations.controller";

const router = Router();

router.post("/robot-lab/session", postCourseSession);
router.post("/robot-lab/stripe/webhook", postCourseStripeWebhook);
router.get("/robot-lab/checkout/status/:sessionId", getCourseCheckoutStatus);
router.get("/robot-lab/certificate/verify/:code", getCourseCertificateVerification);
router.delete("/robot-lab/session", courseAuthRequired, deleteCourseSession);
router.get("/robot-lab/state", courseAuthRequired, getCourseState);
router.post("/robot-lab/consent", courseAuthRequired, postCourseConsent);
router.patch("/robot-lab/progress/:moduleId", courseAuthRequired, patchCourseProgress);
router.post("/robot-lab/submissions", courseAuthRequired, courseUploadSingle, postCourseSubmission);
router.get("/robot-lab/submissions/:id/download", courseAuthRequired, downloadCourseSubmission);
router.get("/robot-lab/admin", courseAuthRequired, courseAdminRequired, getCourseAdmin);
router.get("/robot-lab/admin/operations", courseAuthRequired, courseAdminRequired, getCourseAdminOperations);
router.post("/robot-lab/admin/entitlements", courseAuthRequired, courseAdminRequired, postCourseAdminGrant);
router.post("/robot-lab/admin/entitlements/:userId/revoke", courseAuthRequired, courseAdminRequired, postCourseAdminRevoke);
router.patch("/robot-lab/admin/submissions/:id", courseAuthRequired, courseAdminRequired, patchCourseAdminSubmission);
router.patch("/robot-lab/admin/support/:id", courseAuthRequired, courseAdminRequired, patchCourseAdminSupport);
router.post("/robot-lab/events", courseAuthRequired, postCourseAnalytics);
router.get("/robot-lab/support", courseAuthRequired, getCourseSupport);
router.post("/robot-lab/support", courseAuthRequired, postCourseSupport);
router.get("/robot-lab/certificate", courseAuthRequired, getCourseCertificate);
router.post("/robot-lab/certificate", courseAuthRequired, postCourseCertificate);
router.get("/robot-lab/certificate/download", courseAuthRequired, downloadCourseCertificate);
router.post("/robot-lab/account/password", courseAuthRequired, postCoursePasswordChange);
router.get("/robot-lab/access", courseAuthRequired, getRobotLabAccess);
router.get("/robot-lab/nginx-auth", getRobotLabNginxAuth);
router.get("/robot-lab/nginx-professional-auth", getRobotLabNginxProfessionalAuth);
router.post("/robot-lab/assistant", courseAuthRequired, postRobotLabAssistant);
router.post("/robot-lab/checkout", postRobotLabCheckout);

export default router;
