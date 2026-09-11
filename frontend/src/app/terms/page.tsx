'use client';

import Link from 'next/link';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { Card, CardBody, CardHeader } from '@/components/ui/primitives';

export default function TermsPage() {
  return (
    <AppShell>
      <PageHeader title="Terms and Conditions" backHref="/profile" />
      <PageBody width="wide">
        <div className="mx-auto max-w-4xl space-y-6 pb-12">
          {/* Header Banner */}
          <div className="rounded-card border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-white shadow-md">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-fg">TERMS AND CONDITIONS</h1>
                <p className="mt-0.5 text-xs text-muted">
                  Platform: <strong>CPT Trading</strong> &nbsp;|&nbsp; Effective Date: 06/23/2016 &nbsp;|&nbsp; Last Updated: 05/13/2026
                </p>
              </div>
            </div>
          </div>

          {/* Section 1 */}
          <Card>
            <CardHeader title="1. INTRODUCTION AND ACCEPTANCE" />
            <CardBody className="space-y-4 text-sm leading-relaxed text-fg/90">
              <div>
                <h3 className="font-semibold text-fg">1.1 Acceptance of Terms</h3>
                <p className="mt-1 text-muted">
                  By accessing, registering with, or using CPT Trading, you agree to be bound by these Terms and Conditions. If you do not agree with any part of these Terms, you must refrain from using the Platform.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">1.2 Parties</h3>
                <p className="mt-1 text-muted">
                  These Terms constitute a legally binding agreement between you and CPT Trading, the operator of the Platform.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">1.3 Eligibility</h3>
                <p className="mt-1 text-muted">To use the Platform, you must:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  <li>Be at least 21 years of age;</li>
                  <li>Be legally capable of entering into binding contracts;</li>
                  <li>Not be resident in, or a citizen of, any restricted or sanctioned jurisdiction; and</li>
                  <li>Successfully complete our identity verification (KYC) process prior to engaging in any trading activity.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-fg">1.4 Account Registration</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                  <li>You agree to provide accurate, current, and complete information during registration and to keep such information updated at all times.</li>
                  <li>You are solely responsible for maintaining the confidentiality of your login credentials.</li>
                  <li>You must notify us immediately upon becoming aware of any unauthorized access to, or use of, your account.</li>
                  <li>We reserve the right to refuse, suspend, or close any account at our sole discretion, including where required for regulatory or compliance reasons.</li>
                </ul>
              </div>
            </CardBody>
          </Card>

          {/* Section 2 */}
          <Card>
            <CardHeader title="2. SERVICES AND RISK DISCLOSURE" />
            <CardBody className="space-y-4 text-sm leading-relaxed text-fg/90">
              <div>
                <h3 className="font-semibold text-fg">2.1 Services</h3>
                <p className="mt-1 text-muted">
                  We provide CFD trading, cryptocurrency exchange and other services. All transactions are executed solely on your instruction.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">2.2 Risk Disclosure</h3>
                <p className="mt-1 text-muted">
                  Trading involves a substantial risk of loss and is not suitable for all investors. By using the Services, you acknowledge and accept that:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  <li>Leveraged products may result in losses exceeding your deposited funds;</li>
                  <li>Past performance is not indicative of future results;</li>
                  <li>You should only trade with funds you can afford to lose; and</li>
                  <li>A significant percentage of retail investor accounts lose money when trading leveraged products.</li>
                </ul>
              </div>
            </CardBody>
          </Card>

          {/* Section 3 */}
          <Card>
            <CardHeader title="3. DEPOSITS AND WITHDRAWALS" />
            <CardBody className="space-y-5 text-sm leading-relaxed text-fg/90">
              <div>
                <h3 className="font-semibold text-fg">3.1 General Deposit and Withdrawal Conditions</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                  <li>All funds must originate from bank accounts or payment methods held in your own name.</li>
                  <li>Withdrawals will, wherever possible, be processed back to the original funding source.</li>
                  <li>Processing times and applicable fees are set out in the Fee Schedule and in Section 3.2 below.</li>
                  <li>We reserve the right to suspend or delay withdrawals during investigations or where required by applicable law or regulation.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-fg">3.2 Withdrawal Terms</h3>
                <p className="mt-1 text-muted">
                  These Withdrawal Terms apply to all withdrawal requests and form an integral part of these Terms. By submitting a withdrawal request, you confirm that you have read, understood, and agree to comply with the conditions set out below.
                </p>
              </div>

              <div className="space-y-3 pl-2 border-l-2 border-primary/30">
                <div>
                  <h4 className="font-semibold text-fg">3.2.1 Full Withdrawal</h4>
                  <p className="mt-1 text-muted">
                    Available funds must be withdrawn in a single transaction, subject to the applicable withdrawal requirements set out in these Terms. Partial withdrawals of available funds are permitted only where expressly allowed under your VIP tier limits or where otherwise approved by us in writing.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-fg">3.2.2 Withdrawals Exceeding $10,000</h4>
                  <p className="mt-1 text-muted">
                    Withdrawal amounts exceeding $10,000 may be subject to specific withdrawal increments, such as multiples of $1,000. For example, where your intended withdrawal exceeds $10,000, you may only be permitted to withdraw amounts such as <strong>$11,000, $12,000, $13,000</strong>, and so forth, unless otherwise approved by us.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-fg">3.2.3 Cancellation</h4>
                  <p className="mt-1 text-muted">
                    Once a withdrawal request has been submitted and processed, it may not be possible to cancel or reverse it. You are advised to verify all withdrawal details carefully before submission. Where cancellation is required under applicable law, we will comply with our legal obligations.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-fg">3.2.4 Processing Time</h4>
                  <p className="mt-1 text-muted">
                    Following the successful initiation of a withdrawal, funds may take approximately 2 to 24 hours to reflect in the designated wallet, subject to processing and banking times. Actual timing may vary due to bank cut-off times, weekends, public holidays, or delays caused by third-party processors.
                  </p>
                </div>

                <div>
                  <h4 className="font-semibold text-fg">3.2.5 Compliance with Platform Terms</h4>
                  <p className="mt-1 text-muted">
                    All applicable withdrawal terms and conditions are published on the Platform and must be reviewed and complied with prior to submitting a withdrawal request. Withdrawal requests that do not comply with these Terms may be rejected, delayed, or returned.
                  </p>
                </div>
              </div>

              {/* VIP Tiers Detailed */}
              <div>
                <h3 className="font-semibold text-fg">3.2.6 Withdrawal Requirements by VIP Tier</h3>
                <p className="mt-1 text-muted">Withdrawal limits are determined by your assigned VIP tier:</p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-card border border-border/80 bg-surface/50 p-3.5">
                    <h5 className="font-bold text-primary">VIP 1</h5>
                    <p className="text-xs text-muted mt-1">Maximum withdrawal amount: <strong>$2,000</strong></p>
                    <p className="text-xs text-muted mt-0.5">Single transaction cannot exceed $2,000.</p>
                    <div className="mt-2 text-xs">
                      <span className="text-success font-semibold">Valid:</span> $500, $1,000, $1,999, $2,000<br/>
                      <span className="text-danger font-semibold">Invalid:</span> $2,001, $3,000, $5,000
                    </div>
                  </div>

                  <div className="rounded-card border border-border/80 bg-surface/50 p-3.5">
                    <h5 className="font-bold text-primary">VIP 2</h5>
                    <p className="text-xs text-muted mt-1">Withdrawal amount must be <strong>less than $5,000</strong>.</p>
                    <p className="text-xs text-muted mt-0.5">Maximum: $4,999.99 (Min: $2,001).</p>
                    <div className="mt-2 text-xs">
                      <span className="text-success font-semibold">Valid:</span> $1,000, $3,500, $4,999<br/>
                      <span className="text-danger font-semibold">Invalid:</span> $5,000 (falls under VIP 3), $10,000
                    </div>
                  </div>

                  <div className="rounded-card border border-border/80 bg-surface/50 p-3.5">
                    <h5 className="font-bold text-primary">VIP 3</h5>
                    <p className="text-xs text-muted mt-1">Range: <strong>$5,000 to $10,000</strong></p>
                    <p className="text-xs text-muted mt-0.5">Minimum: $5,000 | Maximum: $10,000.</p>
                    <div className="mt-2 text-xs">
                      <span className="text-success font-semibold">Valid:</span> $5,000, $7,500, $9,999, $10,000<br/>
                      <span className="text-danger font-semibold">Invalid:</span> $4,999, $10,001
                    </div>
                  </div>

                  <div className="rounded-card border border-border/80 bg-surface/50 p-3.5">
                    <h5 className="font-bold text-primary">VIP 4</h5>
                    <p className="text-xs text-muted mt-1">Range: <strong>$10,000 to $50,000</strong></p>
                    <p className="text-xs text-muted mt-0.5">Minimum: $10,000 | Maximum: $50,000.</p>
                    <div className="mt-2 text-xs">
                      <span className="text-success font-semibold">Valid:</span> $10,000, $25,000, $49,000, $50,000<br/>
                      <span className="text-danger font-semibold">Invalid:</span> $9,999, $50,001
                    </div>
                  </div>

                  <div className="rounded-card border border-border/80 bg-surface/50 p-3.5 sm:col-span-2">
                    <h5 className="font-bold text-primary">Super VIP</h5>
                    <p className="text-xs text-muted mt-1">Withdrawal amount must <strong>exceed $50,000</strong>.</p>
                    <p className="text-xs text-muted mt-0.5">Minimum: $50,000.01 | Maximum: No upper limit.</p>
                    <div className="mt-2 text-xs">
                      <span className="text-success font-semibold">Valid:</span> $50,001, $75,000, $100,000, $250,000<br/>
                      <span className="text-danger font-semibold">Invalid:</span> $50,000, $49,999
                    </div>
                  </div>
                </div>
              </div>

              {/* Quick Reference Table */}
              <div>
                <h3 className="font-semibold text-fg">3.2.7 Quick Reference Table</h3>
                <div className="mt-2 overflow-x-auto rounded-card border border-border/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface text-fg font-semibold">
                      <tr className="border-b border-border">
                        <th className="p-3">VIP Tier</th>
                        <th className="p-3">Withdrawal Range</th>
                        <th className="p-3">Minimum</th>
                        <th className="p-3">Maximum</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-muted">
                      <tr><td className="p-3 font-medium text-fg">VIP 1</td><td className="p-3">Cannot exceed $2,000</td><td className="p-3">$50</td><td className="p-3">$2,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 2</td><td className="p-3">Less than $5,000</td><td className="p-3">$2,001</td><td className="p-3">$5,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 3</td><td className="p-3">$5,000 to $10,000</td><td className="p-3">$5,001</td><td className="p-3">$10,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 4</td><td className="p-3">$10,000 to $50,000</td><td className="p-3">$10,001</td><td className="p-3">$50,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">Super VIP</td><td className="p-3">Exceeding $50,001+</td><td className="p-3">$50,000.01</td><td className="p-3">No limit</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-fg">3.2.8 General Withdrawal Conditions</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                  <li>All withdrawals are subject to identity verification (KYC) and anti-money laundering (AML) checks.</li>
                  <li>Funds must be withdrawn to a bank account held in your own name.</li>
                  <li>We may suspend or delay withdrawals where required by law or regulation, or to investigate suspected fraud, market abuse, or breach of these Terms.</li>
                  <li>Fees, currency conversion charges, and processing costs are set out in the Fee Schedule.</li>
                  <li>Withdrawal requests falling outside your applicable VIP tier range may be rejected or adjusted, and the applicable increments set out in Section 3.2.2 shall apply where relevant.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-fg">3.2.9 Boundary Clarifications</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                  <li><strong>$5,000</strong> falls within <strong>VIP 2</strong>, not VIP 1. VIP 1 is strictly &quot;less than $5,000.&quot;</li>
                  <li><strong>$10,000</strong> falls within <strong>VIP 3</strong>.</li>
                  <li><strong>$50,000</strong> falls within <strong>VIP 4</strong>, not Super VIP. Super VIP is strictly &quot;above $50,000.&quot;</li>
                  <li>The $10,000+ increment rule set out in Section 3.2.2 applies to all tiers.</li>
                </ul>
              </div>

              {/* VIP Upgrades */}
              <div>
                <h3 className="font-semibold text-fg">3.2.10 VIP Tier Upgrade Requirements</h3>
                <p className="mt-1 text-muted">
                  To upgrade your account to a higher VIP tier, you must satisfy the following single-transaction deposit requirements. Deposits must be made in one transaction; multiple smaller deposits will not be aggregated to meet the threshold.
                </p>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-card border border-border/80 bg-surface/40 p-3">
                    <h5 className="font-semibold text-fg">Upgrade to VIP 2</h5>
                    <p className="text-xs text-muted mt-1">Required deposit: <strong>$1,000</strong> (single transaction).</p>
                  </div>
                  <div className="rounded-card border border-border/80 bg-surface/40 p-3">
                    <h5 className="font-semibold text-fg">Upgrade to VIP 3</h5>
                    <p className="text-xs text-muted mt-1">Required deposit: <strong>$3,000</strong> (single transaction).</p>
                  </div>
                  <div className="rounded-card border border-border/80 bg-surface/40 p-3">
                    <h5 className="font-semibold text-fg">Upgrade to VIP 4</h5>
                    <p className="text-xs text-muted mt-1">Required deposit: <strong>$5,000</strong> (single transaction).</p>
                  </div>
                  <div className="rounded-card border border-border/80 bg-surface/40 p-3">
                    <h5 className="font-semibold text-fg">Upgrade to Super VIP</h5>
                    <p className="text-xs text-muted mt-1">Required deposit: <strong>$10,000</strong> (single transaction).</p>
                  </div>
                </div>

                <div className="mt-3 overflow-x-auto rounded-card border border-border/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface text-fg font-semibold">
                      <tr className="border-b border-border">
                        <th className="p-3">Target VIP Tier</th>
                        <th className="p-3">Required Single Deposit</th>
                        <th className="p-3">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-muted">
                      <tr><td className="p-3 font-medium text-fg">VIP 2</td><td className="p-3">$1,000</td><td className="p-3">Must be one transaction</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 3</td><td className="p-3">$3,000</td><td className="p-3">Must be one transaction</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 4</td><td className="p-3">$5,000</td><td className="p-3">Must be one transaction</td></tr>
                      <tr><td className="p-3 font-medium text-fg">Super VIP</td><td className="p-3">$10,000</td><td className="p-3">Must be one transaction</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Combined Table */}
              <div>
                <h3 className="font-semibold text-fg">3.2.12 Combined VIP Tier Overview</h3>
                <div className="mt-2 overflow-x-auto rounded-card border border-border/70">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface text-fg font-semibold">
                      <tr className="border-b border-border">
                        <th className="p-3">VIP Tier</th>
                        <th className="p-3">Required Single Deposit to Upgrade</th>
                        <th className="p-3">Withdrawal Range</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-muted">
                      <tr><td className="p-3 font-medium text-fg">VIP 1</td><td className="p-3">— (entry tier)</td><td className="p-3">Up to $2,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 2</td><td className="p-3">$1,000</td><td className="p-3">Less than $5,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 3</td><td className="p-3">$3,000</td><td className="p-3">$5,000 to $10,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">VIP 4</td><td className="p-3">$5,000</td><td className="p-3">$10,000 to $50,000</td></tr>
                      <tr><td className="p-3 font-medium text-fg">Super VIP</td><td className="p-3">$10,000</td><td className="p-3">Above $50,000</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* Section 4 */}
          <Card>
            <CardHeader title="4. EXTENSION FEE" />
            <CardBody className="space-y-4 text-sm leading-relaxed text-fg/90">
              <p className="text-muted">
                This Section applies where a Client fails to complete assigned tasks within the required timeframe. By using the Platform and accepting assigned tasks, you agree to the terms set out below.
              </p>

              <div>
                <h3 className="font-semibold text-fg">4.1 Unauthorized Delays</h3>
                <p className="mt-1 text-muted">
                  Any unauthorized delay in the completion of assigned tasks may result in the imposition of an extension fee. A delay shall be deemed &quot;unauthorized&quot; where the Client fails to complete a task by the applicable deadline without prior written approval from us. Delays caused by verified technical faults, force majeure, or other circumstances beyond the Client&apos;s reasonable control may be reviewed on a case-by-case basis.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">4.2 Extension Fee Assessment</h3>
                <p className="mt-1 text-muted">
                  Where an unauthorized delay occurs, an extension fee may be required to extend the deadline or to permit the task to proceed. The extension fee is determined by the merchant (us) and is assessed based on:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  <li><strong>Your Credit Score</strong> — higher credit scores may attract lower fees, while lower scores may attract higher fees;</li>
                  <li><strong>Your Account Balance</strong> — the fee may be scaled according to the funds held in your account; and</li>
                  <li><strong>The Duration and Nature of the Delay</strong> — longer or more significant delays may attract higher fees.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-fg">4.3 Payment of the Extension Fee</h3>
                <p className="mt-1 text-muted">
                  The extension fee must be paid in full before the extension takes effect. Extension fees are non-refundable once paid, except where required by applicable law. Failure to pay the extension fee may result in suspension or cancellation of assigned tasks, account restriction, forfeiture of rewards, or termination.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">4.4 No Waiver</h3>
                <p className="mt-1 text-muted">
                  Our decision to grant an extension, waive a fee, or vary a fee in any particular case does not create a precedent or obligation to do so in any other case.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">4.5 Acknowledgment</h3>
                <p className="mt-1 text-muted">
                  By accepting an assigned task, you acknowledge that you have read, understood, and accept Section 4, and agree to pay any applicable extension fee as determined by us.
                </p>
              </div>
            </CardBody>
          </Card>

          {/* Section 5, 6, 7, 8 */}
          <Card>
            <CardHeader title="5. FEES AND CHARGES" />
            <CardBody className="text-sm leading-relaxed text-muted">
              Spreads, commissions, overnight financing charges, currency conversion fees, inactivity fees, withdrawal fees, and extension fees are set out in the Fee Schedule, which is incorporated into these Terms by reference. Withdrawal amounts, VIP tier limits, VIP upgrade requirements, and extension fee terms are governed by Sections 3.2 and 4 respectively.
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="6. CLIENT OBLIGATIONS AND PROHIBITED CONDUCT" />
            <CardBody className="space-y-4 text-sm leading-relaxed text-fg/90">
              <div>
                <h3 className="font-semibold text-fg">6.1 Prohibited Conduct</h3>
                <p className="mt-1 text-muted">You shall not:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  <li>Use the Platform for money laundering, terrorism financing, or market manipulation;</li>
                  <li>Use bots, latency arbitrage strategies, or exploit pricing errors;</li>
                  <li>Share accounts or credentials with any third party;</li>
                  <li>Reverse engineer, scrape, or otherwise interfere with the Platform; or</li>
                  <li>Violate any applicable law, regulation, or exchange rule.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-fg">6.2 Intellectual Property</h3>
                <p className="mt-1 text-muted">
                  All Platform content, software, trademarks, and data are owned by CPT Trading or its licensors. You are granted a limited, non-transferable, non-exclusive license for personal use only.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">6.3 Third-Party Services</h3>
                <p className="mt-1 text-muted">
                  Links to third-party sites or data feeds are provided on an &quot;as is&quot; basis. We are not responsible for the content, accuracy, or availability of any third-party services.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="7. LIABILITY, INDEMNIFICATION, AND TERMINATION" />
            <CardBody className="space-y-4 text-sm leading-relaxed text-fg/90">
              <div>
                <h3 className="font-semibold text-fg">7.1 Limitation of Liability</h3>
                <p className="mt-1 text-muted">
                  To the maximum extent permitted by applicable law, CPT Trading shall not be liable for any indirect, incidental, special, or consequential damages, including lost profits or trading losses. Nothing in these Terms excludes liability for fraud or for any matter that cannot be excluded by law.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">7.2 Indemnification</h3>
                <p className="mt-1 text-muted">
                  You agree to indemnify, defend, and hold harmless CPT Trading against any claims, losses, liabilities, or expenses arising from your breach of these Terms or misuse of the Platform.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">7.3 Termination</h3>
                <p className="mt-1 text-muted">
                  We may suspend or terminate your access to the Platform at any time. You may close your account subject to the settlement of any open positions and outstanding obligations.
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="8. GOVERNING LAW AND GENERAL PROVISIONS" />
            <CardBody className="space-y-4 text-sm leading-relaxed text-fg/90">
              <div>
                <h3 className="font-semibold text-fg">8.1 Dispute Resolution</h3>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                  <li><strong>Arbitration:</strong> Disputes shall be resolved by binding arbitration in USA.</li>
                  <li><strong>Courts:</strong> The courts of United States shall have exclusive jurisdiction.</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-fg">8.2 Governing Law</h3>
                <p className="mt-1 text-muted">
                  These Terms shall be governed by and construed in accordance with the laws of United States.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">8.3 Amendments</h3>
                <p className="mt-1 text-muted">
                  We may amend these Terms from time to time with notice. Continued use of the Platform constitutes acceptance of any amended Terms.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-fg">8.4 Severability and Entire Agreement</h3>
                <p className="mt-1 text-muted">
                  If any provision of these Terms is held unenforceable, the remaining provisions shall remain in full force and effect. These Terms, together with any referenced policies, constitute the entire agreement between you and us.
                </p>
              </div>
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </AppShell>
  );
}
