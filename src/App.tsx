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
import { CheckCircle2, AlertCircle, Send, Mail, BarChart3, Download, Loader2, Eye, RotateCcw, Trash2 } from 'lucide-react'
import parseLLMJson from '@/utils/jsonParser'
import { callAIAgent } from '@/utils/aiAgent'

// Types
interface FeedbackRequest {
  id: string
  candidateName: string
  candidateRole: string
  reviewerEmails: string[]
  status: 'draft' | 'sent' | 'completed'
  createdAt: string
  formLinks: { email: string; link: string; status: string }[]
  feedback?: any
}

interface CriterionScore {
  score: number
  feedback: string
}

// Main App
function App() {
  const [currentView, setCurrentView] = useState<'input' | 'dashboard'>('input')
  const [candidateName, setCandidateName] = useState('')
  const [candidateRole, setCandidateRole] = useState('')
  const [reviewerEmails, setReviewerEmails] = useState('')
  const [requests, setRequests] = useState<FeedbackRequest[]>([])
  const [selectedRequest, setSelectedRequest] = useState<FeedbackRequest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccessMessage('')

    if (!candidateName.trim() || !candidateRole.trim() || !reviewerEmails.trim()) {
      setError('Please fill in all fields')
      return
    }

    const emailList = reviewerEmails
      .split('\n')
      .map(e => e.trim())
      .filter(e => e && e.includes('@'))

    if (emailList.length === 0) {
      setError('Please enter at least one valid email address')
      return
    }

    setLoading(true)
    try {
      const message = `Please process feedback collection for:
      - Candidate Name: ${candidateName}
      - Candidate Role: ${candidateRole}
      - Reviewer Emails: ${emailList.join(', ')}

      Generate unique feedback form links for each reviewer and send invitations. Then track responses and provide analysis.`

      const response = await callAIAgent(message, '68f90a3671c6b27d6c8e8b5b')
      const data = parseLLMJson(response.response, {})

      const feedbackData = data.result || data

      const newRequest: FeedbackRequest = {
        id: Date.now().toString(),
        candidateName,
        candidateRole,
        reviewerEmails: emailList,
        status: 'sent',
        createdAt: new Date().toISOString(),
        formLinks: feedbackData.form_links || [],
        feedback: feedbackData,
      }

      setRequests([...requests, newRequest])
      setSelectedRequest(newRequest)
      setCandidateName('')
      setCandidateRole('')
      setReviewerEmails('')
      setSuccessMessage('Feedback collection initiated successfully!')
      setCurrentView('dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to process request')
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
              variant={currentView === 'dashboard' ? 'default' : 'outline'}
              onClick={() => setCurrentView('dashboard')}
              className="gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              Dashboard
            </Button>
          </div>
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

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {currentView === 'input' && <InputSection onSubmit={handleSubmit} loading={loading} />}

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
      </main>
    </div>
  )
}

// Input Section Component
interface InputSectionProps {
  onSubmit: (e: React.FormEvent) => Promise<void>
  loading: boolean
}

function InputSection({ onSubmit, loading }: InputSectionProps) {
  const [candidateName, setCandidateName] = useState('')
  const [candidateRole, setCandidateRole] = useState('')
  const [reviewerEmails, setReviewerEmails] = useState('')

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="border-0 shadow-lg">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-light">Create Feedback Assessment</CardTitle>
          <CardDescription>
            Enter candidate details and reviewer emails to initiate the feedback collection process
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-6">
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
              <label className="text-sm font-medium text-slate-700">Reviewer Emails</label>
              <p className="text-xs text-slate-500">One email per line</p>
              <Textarea
                placeholder="john.doe@company.com&#10;jane.smith@company.com&#10;mike.wilson@company.com"
                value={reviewerEmails}
                onChange={e => setReviewerEmails(e.target.value)}
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
}

function DetailsView({ request, onResendInvitations, onExportPDF, loading }: DetailsViewProps) {
  const invitationStatus = request.feedback?.invitation_status || {
    total_invited: request.reviewerEmails.length,
    successfully_sent: 0,
    failed: 0,
    pending_responses: request.reviewerEmails.length,
  }

  return (
    <div className="space-y-6">
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
            <p className="text-sm font-medium text-slate-900 mb-3">Feedback Form Links</p>
            <ScrollArea className="h-64">
              <div className="space-y-2 pr-4">
                {(request.formLinks || []).map((link, idx) => (
                  <div key={idx} className="p-2 bg-slate-50 rounded text-xs">
                    <p className="font-medium text-slate-900">{link.reviewer_email}</p>
                    <div className="flex gap-2 mt-1">
                      <code className="text-slate-600 break-all flex-1">
                        {link.unique_form_link ? link.unique_form_link.substring(0, 50) + '...' : 'Link pending'}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {link.status}
                      </Badge>
                    </div>
                  </div>
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

export default App