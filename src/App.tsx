import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { CheckCircle2, AlertCircle, Send, Mail, BarChart3, Download, Loader2, Eye, RotateCcw, Trash2, ArrowLeft, Copy } from 'lucide-react'
import parseLLMJson from '@/utils/jsonParser'
import { callAIAgent } from '@/utils/aiAgent'

// Types
interface FeedbackRequest {
  id: string
  candidateName: string
  candidateRole: string
  reviewerEmails: string[]
  reviewerNames: string[]
  status: 'draft' | 'sent' | 'completed'
  createdAt: string
  formLinks: { email: string; link: string; status: string; reviewerName: string }[]
  feedback?: any
  responses: FeedbackSubmission[]
}

interface FeedbackSubmission {
  reviewerEmail: string
  reviewerName: string
  submissionTimestamp: string
  scores: {
    leadership_vision: number
    communication_influence: number
    experience_expertise: number
    cultural_fit: number
    team_management: number
  }
  textResponses: {
    leadership_vision: string
    communication_influence: string
    experience_expertise: string
    cultural_fit: string
    team_management: string
  }
}

interface CriterionScore {
  score: number
  feedback: string
}

// Main App
function App() {
  const [currentView, setCurrentView] = useState<'input' | 'dashboard' | 'feedback'>('input')
  const [requests, setRequests] = useState<FeedbackRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<FeedbackRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [feedbackReviewerEmail, setFeedbackReviewerEmail] = useState('')
  const [feedbackReviewerId, setFeedbackReviewerId] = useState('')

  // Parse URL params for feedback form
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const reviewerId = params.get('reviewerId')
    const email = params.get('email')
    const assessmentId = params.get('assessmentId')

    if (reviewerId && email && assessmentId) {
      setFeedbackReviewerId(reviewerId)
      setFeedbackReviewerEmail(email)
      const request = requests.find(r => r.id === assessmentId)
      if (request) {
        setSelectedRequest(request)
        setCurrentView('feedback')
      }
    }
  }, [requests])

  // Handle assessment selection from feedback access screen
  const handleSelectAssessmentForFeedback = (assessment: FeedbackRequest, email: string) => {
    setSelectedRequest(assessment)
    setFeedbackReviewerEmail(email)
  }

  // Handle form submission
  const handleSubmit = async (candidateName: string, candidateRole: string, reviewerData: string) => {
    setError('')
    setSuccessMessage('')

    if (!candidateName.trim() || !candidateRole.trim() || !reviewerData.trim()) {
      setError('Please fill in all fields')
      return
    }

    // Parse reviewer data (format: "Name|email@example.com" per line)
    const reviewerList = reviewerData
      .split('\n')
      .map(line => {
        const [name, email] = line.split('|').map(s => s.trim())
        return { name: name || '', email }
      })
      .filter(r => r.email && r.email.includes('@'))

    if (reviewerList.length === 0) {
      setError('Please enter at least one valid reviewer with email')
      return
    }

    setLoading(true)
    try {
      const emailList = reviewerList.map(r => r.email).join(', ')
      const message = `Please process feedback collection for:
      - Candidate Name: ${candidateName}
      - Candidate Role: ${candidateRole}
      - Reviewer Emails: ${emailList}

      Generate unique feedback form links for each reviewer and send invitations. Then track responses and provide analysis.`

      const response = await callAIAgent(message, '68f90a3671c6b27d6c8e8b5b')
      const data = parseLLMJson(response.response, {})

      const feedbackData = data.result || data
      const assessmentId = Date.now().toString()

      // Generate shareable feedback form links
      const formLinks = reviewerList.map(r => {
        const reviewerId = btoa(`${r.email}-${assessmentId}`)
        return {
          email: r.email,
          reviewerName: r.name,
          link: `${window.location.origin}?reviewerId=${reviewerId}&email=${r.email}&assessmentId=${assessmentId}`,
          status: 'sent'
        }
      })

      const newRequest: FeedbackRequest = {
        id: assessmentId,
        candidateName,
        candidateRole,
        reviewerEmails: reviewerList.map(r => r.email),
        reviewerNames: reviewerList.map(r => r.name),
        status: 'sent',
        createdAt: new Date().toISOString(),
        formLinks,
        feedback: feedbackData,
        responses: [],
      }

      setRequests([...requests, newRequest])
      setSelectedRequest(newRequest)
      setSuccessMessage('Assessment created! Share the feedback form links with reviewers.')
      setCurrentView('dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to process request')
    } finally {
      setLoading(false)
    }
  }

  // Handle feedback submission
  const handleFeedbackSubmit = async (submission: FeedbackSubmission) => {
    if (!selectedRequest) return

    setLoading(true)
    try {
      // Add feedback response to the request
      const updatedRequest = {
        ...selectedRequest,
        responses: [...selectedRequest.responses, submission],
      }

      setRequests(
        requests.map(r => (r.id === selectedRequest.id ? updatedRequest : r))
      )
      setSelectedRequest(updatedRequest)
      setSuccessMessage('Thank you! Your feedback has been submitted.')
      setCurrentView('input')
      setFeedbackReviewerId('')
      setFeedbackReviewerEmail('')

      // Notify agent about new response
      const message = `New feedback received for ${updatedRequest.candidateName}:
      Reviewer: ${submission.reviewerName} (${submission.reviewerEmail})
      Scores: ${JSON.stringify(submission.scores)}`
      await callAIAgent(message, '68f90a3671c6b27d6c8e8b5b')
    } catch (err: any) {
      setError(err.message || 'Failed to submit feedback')
    } finally {
      setLoading(false)
    }
  }

  // Resend invitations
  const handleResendInvitations = async (request: FeedbackRequest) => {
    setLoading(true)
    try {
      const message = `Resend feedback collection invitations for:
      - Candidate: ${request.candidateName}
      - Reviewers: ${request.reviewerEmails.join(', ')}`

      const response = await callAIAgent(message, '68f90a3671c6b27d6c8e8b5b')
      const data = parseLLMJson(response.response, {})

      setSuccessMessage('Invitations resent successfully!')
    } catch (err: any) {
      setError(err.message || 'Failed to resend invitations')
    } finally {
      setLoading(false)
    }
  }

  // Export PDF
  const handleExportPDF = () => {
    if (!selectedRequest?.feedback) return

    const content = generatePDFContent(selectedRequest)
    const element = document.createElement('a')
    const file = new Blob([content], { type: 'text/plain' })
    element.href = URL.createObjectURL(file)
    element.download = `feedback-${selectedRequest.candidateName}-${Date.now()}.txt`
    document.body.appendChild(element)
    element.click()
    document.body.removeChild(element)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Header */}
      <header className="border-b border-slate-200/50 bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-light text-slate-900">360° Feedback</h1>
            <p className="text-sm text-slate-500">Intelligent candidate evaluation</p>
          </div>
          {currentView !== 'feedback' && (
            <div className="flex gap-2">
              <Button
                variant={currentView === 'input' ? 'default' : 'outline'}
                onClick={() => setCurrentView('input')}
                className="gap-2"
              >
                <Mail className="w-4 h-4" />
                New Assessment
              </Button>
              <Button
                variant="outline"
                onClick={() => setCurrentView('feedback')}
                className="gap-2 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
              >
                <Send className="w-4 h-4" />
                Give Feedback
              </Button>
              <Button
                variant={currentView === 'dashboard' ? 'default' : 'outline'}
                onClick={() => setCurrentView('dashboard')}
                className="gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </Button>
            </div>
          )}
          {currentView === 'feedback' && (
            <Button
              variant="outline"
              onClick={() => setCurrentView('input')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {successMessage && (
          <Alert className="mb-6 border-green-200 bg-green-50">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
          </Alert>
        )}

        {currentView === 'input' && <InputSection onSubmit={handleSubmit} loading={loading} error={error} />}

        {currentView === 'dashboard' && (
          <DashboardSection
            requests={requests}
            selectedRequest={selectedRequest}
            onSelectRequest={setSelectedRequest}
            onResendInvitations={handleResendInvitations}
            onExportPDF={handleExportPDF}
            loading={loading}
          />
        )}

        {currentView === 'feedback' && (
          selectedRequest ? (
            <FeedbackFormView
              request={selectedRequest}
              reviewerEmail={feedbackReviewerEmail}
              onSubmit={handleFeedbackSubmit}
              loading={loading}
            />
          ) : (
            <FeedbackAccessSection
              assessments={requests}
              onSelectAssessment={(request, email) => {
                handleSelectAssessmentForFeedback(request, email)
              }}
            />
          )
        )}
      </main>
    </div>
  )
}

// Input Section Component
interface InputSectionProps {
  onSubmit: (candidateName: string, candidateRole: string, reviewerData: string) => Promise<void>
  loading: boolean
  error: string
}

function InputSection({ onSubmit, loading, error }: InputSectionProps) {
  const [candidateName, setCandidateName] = useState('')
  const [candidateRole, setCandidateRole] = useState('')
  const [reviewerData, setReviewerData] = useState('')

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await onSubmit(candidateName, candidateRole, reviewerData)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-light">Create Feedback Assessment</CardTitle>
          <CardDescription>
            Enter candidate details and reviewer information to initiate the feedback collection process
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form onSubmit={handleFormSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Candidate Name</label>
              <Input
                placeholder="e.g., Sarah Johnson"
                value={candidateName}
                onChange={e => setCandidateName(e.target.value)}
                className="text-base"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Position/Role</label>
              <Input
                placeholder="e.g., Senior Engineering Manager"
                value={candidateRole}
                onChange={e => setCandidateRole(e.target.value)}
                className="text-base"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Reviewers</label>
              <p className="text-xs text-slate-500">Format: Name | email@example.com (one per line)</p>
              <Textarea
                placeholder="John Doe | john.doe@company.com&#10;Jane Smith | jane.smith@company.com&#10;Mike Wilson | mike.wilson@company.com"
                value={reviewerData}
                onChange={e => setReviewerData(e.target.value)}
                className="text-base min-h-32 resize-none"
              />
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base gap-2 bg-indigo-600 hover:bg-indigo-700"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Initiating Assessment...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Start Assessment
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

// Dashboard Section Component
interface DashboardSectionProps {
  requests: FeedbackRequest[]
  selectedRequest: FeedbackRequest | null
  onSelectRequest: (request: FeedbackRequest) => void
  onResendInvitations: (request: FeedbackRequest) => void
  onExportPDF: () => void
  loading: boolean
}

function DashboardSection({
  requests,
  selectedRequest,
  onSelectRequest,
  onResendInvitations,
  onExportPDF,
  loading,
}: DashboardSectionProps) {
  if (requests.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 mb-4">No assessments yet. Create one to get started.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Requests List */}
      <div className="lg:col-span-1">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-lg font-light">Assessments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {requests.map(req => (
                <button
                  key={req.id}
                  onClick={() => onSelectRequest(req)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRequest?.id === req.id
                      ? 'bg-indigo-50 border border-indigo-200'
                      : 'hover:bg-slate-50 border border-slate-200'
                  }`}
                >
                  <div className="font-medium text-sm text-slate-900">{req.candidateName}</div>
                  <div className="text-xs text-slate-500">{req.candidateRole}</div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    <Badge variant="secondary" className="text-xs">
                      {req.reviewerEmails.length} reviewers
                    </Badge>
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        req.status === 'completed' ? 'bg-green-50' : 'bg-blue-50'
                      }`}
                    >
                      {req.status}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Details View */}
      <div className="lg:col-span-2">
        {selectedRequest ? (
          <Tabs defaultValue="summary" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="responses">Responses</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
            </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary">
              {selectedRequest.feedback ? (
                <SummaryView feedback={selectedRequest.feedback} />
              ) : (
                <Card className="border-0 shadow-lg p-8 text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-indigo-600" />
                  <p className="text-slate-600">Analyzing feedback...</p>
                </Card>
              )}
            </TabsContent>

            {/* Responses Tab */}
            <TabsContent value="responses">
              <ResponsesView feedback={selectedRequest.feedback} />
            </TabsContent>

            {/* Details Tab */}
            <TabsContent value="details">
              <DetailsView
                request={selectedRequest}
                onResendInvitations={() => onResendInvitations(selectedRequest)}
                onExportPDF={onExportPDF}
                loading={loading}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <Card className="border-0 shadow-lg p-8 text-center">
            <p className="text-slate-500">Select an assessment to view details</p>
          </Card>
        )}
      </div>
    </div>
  )
}

// Summary View Component
function SummaryView({ feedback }: { feedback: any }) {
  const summary = feedback.feedback_summary || {}
  const criterionBreakdown = summary.criterion_breakdown || {}

  const criteriaList = [
    { key: 'leadership_vision', label: 'Leadership & Vision' },
    { key: 'communication_influence', label: 'Communication & Influence' },
    { key: 'experience_expertise', label: 'Experience & Expertise' },
    { key: 'cultural_fit', label: 'Cultural Fit' },
    { key: 'team_management', label: 'Team Management' },
  ]

  const overallScore = summary.overall_score || 0
  const recommendationColor = getRecommendationColor(summary.recommendation)

  return (
    <div className="space-y-6">
      {/* Overall Score */}
      <Card className="border-0 shadow-lg bg-gradient-to-br from-indigo-50 to-blue-50">
        <CardContent className="pt-6">
          <div className="text-center mb-4">
            <div className="text-5xl font-light text-indigo-600 mb-2">
              {(overallScore * 20).toFixed(0)}%
            </div>
            <p className="text-slate-600">Overall Score</p>
          </div>
          <Progress value={overallScore * 20} className="h-2" />
          <div className="mt-4 text-sm text-slate-600">
            Based on {summary.total_responses || 0} responses ({summary.completion_percentage || 0}% complete)
          </div>
        </CardContent>
      </Card>

      {/* Recommendation */}
      <Card className={`border-0 shadow-lg ${recommendationColor}`}>
        <CardContent className="pt-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-2">Recommendation</p>
              <p className="text-2xl font-light mb-3">{summary.recommendation}</p>
              <p className="text-sm text-slate-700 leading-relaxed">
                {summary.recommendation_rationale}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Criterion Breakdown */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg font-light">Criterion Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {criteriaList.map(criterion => {
            const data = criterionBreakdown[criterion.key] || { score: 0, feedback: '' }
            return (
              <div key={criterion.key} className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="font-medium text-sm text-slate-900">{criterion.label}</p>
                  <Badge className="bg-indigo-100 text-indigo-700">{data.score}/5</Badge>
                </div>
                <Progress value={(data.score / 5) * 100} className="h-2" />
                {data.feedback && (
                  <p className="text-sm text-slate-600">{data.feedback}</p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Strengths & Concerns */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base font-light text-green-700">Key Strengths</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(summary.key_strengths || []).slice(0, 3).map((strength: string, idx: number) => (
                <li key={idx} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-green-600 font-bold">•</span>
                  {strength}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base font-light text-amber-700">Key Concerns</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(summary.key_concerns || []).slice(0, 3).map((concern: string, idx: number) => (
                <li key={idx} className="text-sm text-slate-700 flex gap-2">
                  <span className="text-amber-600 font-bold">•</span>
                  {concern}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Responses View Component
function ResponsesView({ feedback }: { feedback: any }) {
  const responses = feedback.individual_feedback || []

  if (responses.length === 0) {
    return (
      <Card className="border-0 shadow-lg p-8 text-center">
        <p className="text-slate-500">No responses yet</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {responses.map((response: any, idx: number) => (
        <Card key={idx} className="border-0 shadow-lg">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-base font-light">{response.reviewer_name}</CardTitle>
                <p className="text-xs text-slate-500">{response.reviewer_email}</p>
              </div>
              <Badge variant="secondary" className="text-xs">
                {response.submission_timestamp
                  ? new Date(response.submission_timestamp).toLocaleDateString()
                  : 'No date'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(response.scores || {}).map(([criterion, score]: any) => (
                <div key={criterion}>
                  <div className="flex justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">
                      {criterion.replace(/_/g, ' ').toUpperCase()}
                    </p>
                    <Badge className="bg-blue-100 text-blue-700">{score}/5</Badge>
                  </div>
                  <Progress value={(score / 5) * 100} className="h-1.5" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// Details View Component
interface DetailsViewProps {
  request: FeedbackRequest
  onResendInvitations: () => void
  onExportPDF: () => void
  loading: boolean
  onOpenFeedbackForm?: (email: string) => void
}

function DetailsView({ request, onResendInvitations, onExportPDF, loading, onOpenFeedbackForm }: DetailsViewProps) {
  const invitationStatus = request.feedback?.invitation_status || {
    total_invited: request.reviewerEmails.length,
    successfully_sent: 0,
    failed: 0,
    pending_responses: request.reviewerEmails.length,
  }

  const [showCopyNotification, setShowCopyNotification] = useState(false)

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    setShowCopyNotification(true)
    setTimeout(() => setShowCopyNotification(false), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Share Information */}
      <Alert className="border-indigo-200 bg-indigo-50">
        <Mail className="h-4 w-4 text-indigo-600" />
        <AlertDescription className="text-indigo-900">
          Share the feedback form links below with reviewers. Each link is unique and pre-fills their email address.
        </AlertDescription>
      </Alert>

      {showCopyNotification && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Link copied to clipboard!
          </AlertDescription>
        </Alert>
      )}

      {/* Invitation Status */}
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-lg font-light">Invitation Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-light text-slate-900">
                {invitationStatus.total_invited}
              </div>
              <p className="text-xs text-slate-600">Total Invited</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-2xl font-light text-green-600">
                {invitationStatus.successfully_sent}
              </div>
              <p className="text-xs text-green-700">Sent</p>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-2xl font-light text-blue-600">
                {invitationStatus.pending_responses}
              </div>
              <p className="text-xs text-blue-700">Pending</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-2xl font-light text-red-600">
                {invitationStatus.failed}
              </div>
              <p className="text-xs text-red-700">Failed</p>
            </div>
          </div>

          {/* Form Links */}
          <div className="mt-6">
            <p className="text-sm font-medium text-slate-900 mb-4">Shareable Feedback Form Links</p>
            <ScrollArea className="h-96">
              <div className="space-y-3 pr-4">
                {(request.formLinks || []).map((link, idx) => (
                  <Card key={idx} className="border-0 shadow-sm bg-gradient-to-r from-slate-50 to-indigo-50">
                    <CardContent className="pt-4">
                      <div className="space-y-3">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-slate-900">{link.reviewerName || link.email}</p>
                            <p className="text-xs text-slate-500">{link.email}</p>
                          </div>
                          <Badge className="bg-indigo-100 text-indigo-700">{link.status}</Badge>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs font-medium text-slate-600">Feedback Form Link:</p>
                          <div className="flex gap-2 items-stretch">
                            <code className="text-slate-600 break-all flex-1 text-xs bg-white p-2 rounded border border-slate-300 font-mono overflow-hidden">
                              {link.link}
                            </code>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyLink(link.link)}
                              className="flex-shrink-0 gap-1"
                              title="Copy link to clipboard"
                            >
                              <Copy className="w-4 h-4" />
                              Copy
                            </Button>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => window.open(link.link, '_blank')}
                          className="w-full gap-2 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-100"
                        >
                          <Eye className="w-4 h-4" />
                          Test Feedback Form
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={onResendInvitations}
          disabled={loading}
          variant="outline"
          className="flex-1 gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <RotateCcw className="w-4 h-4" />
              Resend Invitations
            </>
          )}
        </Button>
        <Button onClick={onExportPDF} className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700">
          <Download className="w-4 h-4" />
          Export Report
        </Button>
      </div>
    </div>
  )
}

// Helper Functions
function getRecommendationColor(recommendation: string): string {
  const rec = recommendation?.toLowerCase() || ''
  if (rec.includes('strong hire')) return 'bg-gradient-to-br from-green-50 to-emerald-50'
  if (rec.includes('hire')) return 'bg-gradient-to-br from-blue-50 to-cyan-50'
  if (rec.includes('consider')) return 'bg-gradient-to-br from-amber-50 to-yellow-50'
  if (rec.includes('caution')) return 'bg-gradient-to-br from-orange-50 to-red-50'
  if (rec.includes('do not')) return 'bg-gradient-to-br from-red-50 to-rose-50'
  return 'bg-gradient-to-br from-slate-50 to-slate-100'
}

function generatePDFContent(request: FeedbackRequest): string {
  const feedback = request.feedback?.feedback_summary || {}
  const content = `
FEEDBACK ASSESSMENT REPORT
==========================

Candidate: ${request.candidateName}
Position: ${request.candidateRole}
Assessment Date: ${new Date(request.createdAt).toLocaleDateString()}

OVERALL SCORE
=============
Overall Score: ${((feedback.overall_score || 0) * 20).toFixed(0)}%
Total Responses: ${feedback.total_responses || 0}
Completion: ${feedback.completion_percentage || 0}%

RECOMMENDATION
==============
Recommendation: ${feedback.recommendation}
Rationale: ${feedback.recommendation_rationale}

KEY STRENGTHS
=============
${(feedback.key_strengths || []).map((s: string) => `• ${s}`).join('\n')}

KEY CONCERNS
============
${(feedback.key_concerns || []).map((c: string) => `• ${c}`).join('\n')}

CRITERION BREAKDOWN
===================
${Object.entries(feedback.criterion_breakdown || {})
  .map(([key, data]: any) => `${key}: ${data.score}/5 - ${data.feedback}`)
  .join('\n')}

CONSENSUS AREAS
===============
Strong Agreement: ${feedback.consensus_areas?.strong_agreement}
Areas of Disagreement: ${feedback.consensus_areas?.areas_of_disagreement}

EXECUTIVE SUMMARY
=================
${feedback.executive_summary}
  `.trim()

  return content
}

// Feedback Access Section Component
interface FeedbackAccessSectionProps {
  assessments: FeedbackRequest[]
  onSelectAssessment: (request: FeedbackRequest, email: string) => void
}

function FeedbackAccessSection({ assessments, onSelectAssessment }: FeedbackAccessSectionProps) {
  const [emailsByAssessment, setEmailsByAssessment] = useState<{ [key: string]: string }>({})

  if (assessments.length === 0) {
    return (
      <div className="max-w-2xl mx-auto">
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl font-light">Provide Feedback</CardTitle>
            <CardDescription>
              No assessments available at the moment
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-slate-600">
              Ask your HR administrator for a feedback form link, or contact them to create a new assessment.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border-0 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-light">Provide Feedback</CardTitle>
          <CardDescription>
            Select a candidate to provide your 360° feedback
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3">
            {assessments.map(assessment => {
              const email = emailsByAssessment[assessment.id] || ''
              return (
                <Card key={assessment.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="pt-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-lg font-semibold text-slate-900">
                          {assessment.candidateName}
                        </p>
                        <p className="text-sm text-slate-600">
                          {assessment.candidateRole}
                        </p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">Your Email</label>
                        <Input
                          type="email"
                          placeholder="your.email@company.com"
                          value={email}
                          onChange={e => setEmailsByAssessment({
                            ...emailsByAssessment,
                            [assessment.id]: e.target.value
                          })}
                          className="text-sm"
                        />
                      </div>

                      <Button
                        onClick={() => onSelectAssessment(assessment, email)}
                        disabled={!email.includes('@')}
                        className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Send className="w-4 h-4" />
                        Provide Feedback
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Feedback Form View Component
interface FeedbackFormViewProps {
  request: FeedbackRequest
  reviewerEmail: string
  onSubmit: (submission: FeedbackSubmission) => Promise<void>
  loading: boolean
}

function FeedbackFormView({ request, reviewerEmail, onSubmit, loading }: FeedbackFormViewProps) {
  const [scores, setScores] = useState({
    leadership_vision: 3,
    communication_influence: 3,
    experience_expertise: 3,
    cultural_fit: 3,
    team_management: 3,
  })
  const [textResponses, setTextResponses] = useState({
    leadership_vision: '',
    communication_influence: '',
    experience_expertise: '',
    cultural_fit: '',
    team_management: '',
  })

  const criteria = [
    { key: 'leadership_vision', label: 'Leadership & Vision', description: 'Ability to set direction and inspire teams' },
    { key: 'communication_influence', label: 'Communication & Influence', description: 'Clarity in communication and ability to persuade' },
    { key: 'experience_expertise', label: 'Experience & Expertise', description: 'Relevant skills and domain knowledge' },
    { key: 'cultural_fit', label: 'Cultural Fit', description: 'Alignment with company values and culture' },
    { key: 'team_management', label: 'Team Management', description: 'Ability to lead and develop teams' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const submission: FeedbackSubmission = {
      reviewerEmail,
      reviewerName: request.reviewerNames[request.reviewerEmails.indexOf(reviewerEmail)] || reviewerEmail,
      submissionTimestamp: new Date().toISOString(),
      scores: scores as any,
      textResponses: textResponses as any,
    }

    await onSubmit(submission)
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Card className="border-0 shadow-lg mb-6">
        <CardHeader className="bg-gradient-to-r from-indigo-50 to-blue-50">
          <CardTitle className="text-2xl font-light">{request.candidateName}</CardTitle>
          <CardDescription className="text-base">
            {request.candidateRole} - 360° Feedback Form
          </CardDescription>
          <p className="text-sm text-slate-600 mt-2">
            Evaluator: <span className="font-medium">{reviewerEmail}</span>
          </p>
        </CardHeader>
      </Card>

      <form onSubmit={handleSubmit} className="space-y-4">
        {criteria.map((criterion) => (
          <Card key={criterion.key} className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <div>
                <CardTitle className="text-lg font-light">{criterion.label}</CardTitle>
                <CardDescription className="text-sm">{criterion.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-slate-700">Score (1-5)</label>
                  <Badge className="bg-indigo-100 text-indigo-700 text-base px-3 py-1">
                    {scores[criterion.key as keyof typeof scores]}/5
                  </Badge>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={scores[criterion.key as keyof typeof scores]}
                  onChange={e => setScores({
                    ...scores,
                    [criterion.key]: parseInt(e.target.value)
                  })}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Poor</span>
                  <span>Average</span>
                  <span>Excellent</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Comments</label>
                <Textarea
                  placeholder="Please provide specific examples and observations..."
                  value={textResponses[criterion.key as keyof typeof textResponses]}
                  onChange={e => setTextResponses({
                    ...textResponses,
                    [criterion.key]: e.target.value
                  })}
                  className="min-h-24 resize-none text-sm"
                />
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            disabled={loading}
            className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-700 gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                Submit Feedback
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

export default App