#![no_std]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, Address, Env, String,
    Vec,
};
mod escrow {
    use soroban_sdk::{contracttype, Address, String, Vec};

    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub enum JobStatus {
        Created,
        Funded,
        InProgress,
        Completed,
        Disputed,
        Cancelled,
    }

    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub enum MilestoneStatus {
        Pending,
        InProgress,
        Submitted,
        Approved,
    }

    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Milestone {
        pub id: u32,
        pub description: String,
        pub amount: i128,
        pub status: MilestoneStatus,
        pub deadline: u64,
    }

    #[contracttype]
    #[derive(Clone, Debug, Eq, PartialEq)]
    pub struct Job {
        pub id: u64,
        pub client: Address,
        pub freelancer: Address,
        pub token: Address,
        pub total_amount: i128,
        pub status: JobStatus,
        pub milestones: Vec<Milestone>,
        pub job_deadline: u64,
        pub auto_refund_after: u64,
    }

    #[soroban_sdk::contractclient(name = "EscrowContractClient")]
    #[allow(dead_code)]
    pub trait EscrowInterface {
        fn get_job(env: soroban_sdk::Env, job_id: u64) -> Job;
    }
}

use escrow::{EscrowContractClient, JobStatus};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationError {
    InvalidRating = 1,
    AlreadyReviewed = 2,
    SelfReview = 3,
    UserNotFound = 4,
    JobNotCompleted = 5,
    NotJobParticipant = 6,
    JobNotFound = 7,
    Unauthorized = 8,
    NotInitialized = 9,
    InvalidDecayRate = 10,
    BelowMinStake = 11,
    RateLimitExceeded = 12,
    ContractPaused = 13,
    NotAdmin = 14,
    AlreadyReferred = 15,
    SelfReferral = 16,
    CircularReferral = 17,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Review {
    pub reviewer: Address,
    pub reviewee: Address,
    pub job_id: u64,
    pub rating: u32,
    pub comment: String,
    pub stake_weight: i128,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserReputation {
    pub user: Address,
    pub total_score: u64,
    pub total_weight: u64,
    pub review_count: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferralBonusRecord {
    pub amount: u64,
    pub weight: u64,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ReputationTier {
    None = 0,
    Bronze = 1,
    Silver = 2,
    Gold = 3,
    Platinum = 4,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Badge {
    pub badge_type: ReputationTier,
    pub awarded_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferralStats {
    pub total_referrals: u32,
    pub earned_bonus: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
enum DataKey {
    Reputation(Address),
    Reviews(Address),
    ReviewExists(Address, Address, u64),
    Badges(Address),
    Admin,
    DecayRate,
    MinStake,
    RateLimit,
    LastReviewLedger(Address),
    Token,
    Paused,
    Referrer(Address),
    ReferralStats(Address),
    BonusPaid(Address),
    ReferralBonus,
    ReferralBonusList(Address),
}

fn require_not_paused(env: &Env) -> Result<(), ReputationError> {
    if env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false)
    {
        return Err(ReputationError::ContractPaused);
    }
    Ok(())
}

fn require_admin(env: &Env, admin: &Address) -> Result<(), ReputationError> {
    let stored_admin: Address = env
        .storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(ReputationError::NotInitialized)?;

    if admin != &stored_admin {
        return Err(ReputationError::NotAdmin);
    }
    Ok(())
}

const MIN_REVIEW_STAKE_DEFAULT: i128 = 10_000_000; // 1.0 unit (7 decimals)
const RATE_LIMIT_LEDGERS_DEFAULT: u32 = 120; // ~10 minutes
const DEFAULT_REFERRAL_BONUS: u64 = 5; // Equivalates to a 5-star review bonus

const MIN_TTL_THRESHOLD: u32 = 1_000;
const MIN_TTL_EXTEND_TO: u32 = 10_000;

fn bump_reputation_ttl(env: &Env, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Reputation(user.clone()),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_reviews_ttl(env: &Env, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Reviews(user.clone()),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_review_exists_ttl(env: &Env, reviewer: &Address, reviewee: &Address, job_id: u64) {
    env.storage().persistent().extend_ttl(
        &DataKey::ReviewExists(reviewer.clone(), reviewee.clone(), job_id),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_badges_ttl(env: &Env, user: &Address) {
    env.storage().persistent().extend_ttl(
        &DataKey::Badges(user.clone()),
        MIN_TTL_THRESHOLD,
        MIN_TTL_EXTEND_TO,
    );
}

fn bump_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);
}

/// Calculate the reputation tier based on average rating score.
/// Score thresholds:
/// - 0-99: None
/// - 100-299: Bronze
/// - 300-499: Silver
/// - 500-699: Gold
/// - 700+: Platinum
fn calculate_tier(average_rating: u64) -> ReputationTier {
    if average_rating >= 700 {
        ReputationTier::Platinum
    } else if average_rating >= 500 {
        ReputationTier::Gold
    } else if average_rating >= 300 {
        ReputationTier::Silver
    } else if average_rating >= 100 {
        ReputationTier::Bronze
    } else {
        ReputationTier::None
    }
}

#[contract]
pub struct ReputationContract;

#[contractimpl]
impl ReputationContract {
    /// Submit a review for a user after completing a job.
    /// Rating must be between 1 and 5. Stake weight affects the review's influence.
    /// The escrow_contract_id is used to verify the job exists, is completed,
    /// and that reviewer/reviewee are the actual participants of the job.
    pub fn submit_review(
        env: Env,
        escrow_contract_id: Address,
        reviewer: Address,
        reviewee: Address,
        job_id: u64,
        rating: u32,
        comment: String,
        stake_weight: i128,
    ) -> Result<(), ReputationError> {
        reviewer.require_auth();
        require_not_paused(&env)?;

        if !(1..=5).contains(&rating) {
            return Err(ReputationError::InvalidRating);
        }
        if reviewer == reviewee {
            return Err(ReputationError::SelfReview);
        }

        // 1. Minimum Stake Check
        let min_stake = env
            .storage()
            .instance()
            .get(&DataKey::MinStake)
            .unwrap_or(MIN_REVIEW_STAKE_DEFAULT);
        if stake_weight < min_stake {
            return Err(ReputationError::BelowMinStake);
        }

        // 2. Rate Limit Check
        let rate_limit = env
            .storage()
            .instance()
            .get(&DataKey::RateLimit)
            .unwrap_or(RATE_LIMIT_LEDGERS_DEFAULT);
        if rate_limit > 0 {
            let last_ledger_key = DataKey::LastReviewLedger(reviewer.clone());
            if let Some(last_ledger) = env
                .storage()
                .persistent()
                .get::<DataKey, u32>(&last_ledger_key)
            {
                let current_ledger = env.ledger().sequence();
                if current_ledger < last_ledger.saturating_add(rate_limit) {
                    return Err(ReputationError::RateLimitExceeded);
                }
            }
            let current_ledger = env.ledger().sequence();
            env.storage()
                .persistent()
                .set(&last_ledger_key, &current_ledger);
            // Extend TTL for rate limit data
            env.storage().persistent().extend_ttl(
                &last_ledger_key,
                MIN_TTL_THRESHOLD,
                MIN_TTL_EXTEND_TO,
            );
        }

        // Check if this reviewer already reviewed this user for this job
        let review_key = DataKey::ReviewExists(reviewer.clone(), reviewee.clone(), job_id);
        if env.storage().persistent().has(&review_key) {
            return Err(ReputationError::AlreadyReviewed);
        }

        // Cross-contract call: verify the job exists, is completed, and the
        // reviewer/reviewee are the actual client and freelancer of the job.
        let escrow_client = EscrowContractClient::new(&env, &escrow_contract_id);
        let job = match escrow_client.try_get_job(&job_id) {
            Ok(Ok(j)) => j,
            Ok(Err(_)) | Err(_) => return Err(ReputationError::JobNotFound),
        };

        if job.status != JobStatus::Completed {
            return Err(ReputationError::JobNotCompleted);
        }

        let valid_participants = (reviewer == job.client && reviewee == job.freelancer)
            || (reviewer == job.freelancer && reviewee == job.client);

        if !valid_participants {
            return Err(ReputationError::NotJobParticipant);
        }

        // 3. Accountability Stake Transfer
        // Transfer stake from reviewer to this contract
        let token_client = token::Client::new(&env, &job.token);
        token_client.transfer(&reviewer, &env.current_contract_address(), &stake_weight);

        let weight = if stake_weight > 0 {
            stake_weight as u64
        } else {
            1u64
        };

        // Update user reputation
        let rep_key = DataKey::Reputation(reviewee.clone());
        let mut reputation: UserReputation =
            env.storage()
                .persistent()
                .get(&rep_key)
                .unwrap_or(UserReputation {
                    user: reviewee.clone(),
                    total_score: 0,
                    total_weight: 0,
                    review_count: 0,
                });

        reputation.total_score += (rating as u64) * weight;
        reputation.total_weight += weight;
        reputation.review_count += 1;

        env.storage().persistent().set(&rep_key, &reputation);
        bump_reputation_ttl(&env, &reviewee);

        // Store review
        let review = Review {
            reviewer: reviewer.clone(),
            reviewee: reviewee.clone(),
            job_id,
            rating,
            comment,
            stake_weight,
            timestamp: env.ledger().timestamp(),
        };

        let reviews_key = DataKey::Reviews(reviewee.clone());
        let mut reviews: Vec<Review> = env
            .storage()
            .persistent()
            .get(&reviews_key)
            .unwrap_or(Vec::new(&env));
        reviews.push_back(review);
        env.storage().persistent().set(&reviews_key, &reviews);
        bump_reviews_ttl(&env, &reviewee);

        // Mark as reviewed
        env.storage().persistent().set(&review_key, &true);
        bump_review_exists_ttl(&env, &reviewer, &reviewee, job_id);

        // Check for tier upgrade and award badge if necessary
        let new_avg_rating = Self::get_average_rating(env.clone(), reviewee.clone()).unwrap_or(0);
        let new_tier = calculate_tier(new_avg_rating);

        // Get existing badges to check if this tier badge already exists
        let badges_key = DataKey::Badges(reviewee.clone());
        let mut badges: Vec<Badge> = env
            .storage()
            .persistent()
            .get(&badges_key)
            .unwrap_or(Vec::new(&env));

        // Check if user already has this tier badge
        let has_tier_badge = badges.iter().any(|b| b.badge_type == new_tier);

        if !has_tier_badge && new_tier != ReputationTier::None {
            let badge = Badge {
                badge_type: new_tier,
                awarded_at: env.ledger().timestamp(),
            };
            badges.push_back(badge);
            env.storage().persistent().set(&badges_key, &badges);
            bump_badges_ttl(&env, &reviewee);

            // Emit badge awarded event
            env.events().publish(
                (symbol_short!("reput"), symbol_short!("badge")),
                (reviewee.clone(), new_tier),
            );
        }

        // Process referral bonuses for participating on a completed job
        Self::process_referral_bonus(&env, &reviewer);
        Self::process_referral_bonus(&env, &reviewee);

        // Emit event
        env.events().publish(
            (symbol_short!("reput"), symbol_short!("reviewed")),
            (reviewer, reviewee, job_id, rating),
        );

        Ok(())
    }

    /// Register a referrer for a new user. Can only be called once per referree.
    pub fn register_referral(
        env: Env,
        referree: Address,
        referrer: Address,
    ) -> Result<(), ReputationError> {
        referree.require_auth();

        if referree == referrer {
            return Err(ReputationError::SelfReferral);
        }

        let ref_key = DataKey::Referrer(referree.clone());
        if env.storage().persistent().has(&ref_key) {
            return Err(ReputationError::AlreadyReferred);
        }

        // Guard against circular referral chains (max depth check)
        let mut current = referrer.clone();
        let mut depth = 0;
        while let Some(ancestor) = env
            .storage()
            .persistent()
            .get::<DataKey, Address>(&DataKey::Referrer(current.clone()))
        {
            if ancestor == referree {
                return Err(ReputationError::CircularReferral);
            }
            current = ancestor;
            depth += 1;
            if depth > 10 {
                break;
            } // Bounded safety limit
        }

        env.storage().persistent().set(&ref_key, &referrer);
        env.storage()
            .persistent()
            .extend_ttl(&ref_key, MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);

        // Initialize or update referrer stats
        let stats_key = DataKey::ReferralStats(referrer.clone());
        let mut stats = env
            .storage()
            .persistent()
            .get::<DataKey, ReferralStats>(&stats_key)
            .unwrap_or(ReferralStats {
                total_referrals: 0,
                earned_bonus: 0,
            });
        stats.total_referrals += 1;

        env.storage().persistent().set(&stats_key, &stats);
        env.storage()
            .persistent()
            .extend_ttl(&stats_key, MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);

        env.events().publish(
            (symbol_short!("reput"), symbol_short!("referred")),
            (referree, referrer),
        );

        Ok(())
    }

    /// Retrieve the stats for a referrer
    pub fn get_referral_stats(env: Env, referrer: Address) -> ReferralStats {
        let stats_key = DataKey::ReferralStats(referrer.clone());
        let stats: Option<ReferralStats> = env.storage().persistent().get(&stats_key);
        match stats {
            Some(s) => {
                env.storage().persistent().extend_ttl(
                    &stats_key,
                    MIN_TTL_THRESHOLD,
                    MIN_TTL_EXTEND_TO,
                );
                s
            }
            None => ReferralStats {
                total_referrals: 0,
                earned_bonus: 0,
            },
        }
    }

    /// Internal: Credit the bonus to the user's referrer upon their first completed job.
    fn process_referral_bonus(env: &Env, user: &Address) {
        let bonus_paid_key = DataKey::BonusPaid(user.clone());
        if env.storage().persistent().has(&bonus_paid_key) {
            return; // Bonus already paid out for this referree
        }

        let ref_key = DataKey::Referrer(user.clone());
        if let Some(referrer) = env.storage().persistent().get::<DataKey, Address>(&ref_key) {
            // Mark as paid
            env.storage().persistent().set(&bonus_paid_key, &true);
            env.storage().persistent().extend_ttl(
                &bonus_paid_key,
                MIN_TTL_THRESHOLD,
                MIN_TTL_EXTEND_TO,
            );

            // Credit the reputation score equivalent to the bonus rating
            // Effectively a high-weight default review.
            // We now store this as a record for decay calculation.
            let bonus_rating = env
                .storage()
                .instance()
                .get::<DataKey, u64>(&DataKey::ReferralBonus)
                .unwrap_or(DEFAULT_REFERRAL_BONUS);
            let min_stake = env
                .storage()
                .instance()
                .get::<DataKey, i128>(&DataKey::MinStake)
                .unwrap_or(MIN_REVIEW_STAKE_DEFAULT) as u64;
            let earned_score = bonus_rating * min_stake;

            let bonuses_key = DataKey::ReferralBonusList(referrer.clone());
            let mut bonuses: Vec<ReferralBonusRecord> = env
                .storage()
                .persistent()
                .get(&bonuses_key)
                .unwrap_or(Vec::new(env));
            
            bonuses.push_back(ReferralBonusRecord {
                amount: earned_score,
                weight: min_stake,
                timestamp: env.ledger().timestamp(),
            });

            env.storage().persistent().set(&bonuses_key, &bonuses);
            env.storage().persistent().extend_ttl(
                &bonuses_key,
                MIN_TTL_THRESHOLD,
                MIN_TTL_EXTEND_TO,
            );

            // Update legacy accumulator (optional but good for redundant check if needed)
            let rep_key = DataKey::Reputation(referrer.clone());
            let mut reputation: UserReputation = env
                .storage()
                .persistent()
                .get(&rep_key)
                .unwrap_or(UserReputation {
                    user: referrer.clone(),
                    total_score: 0,
                    total_weight: 0,
                    review_count: 0,
                });

            reputation.total_score += earned_score;
            reputation.total_weight += min_stake;

            env.storage().persistent().set(&rep_key, &reputation);
            bump_reputation_ttl(env, &referrer);

            // Update Referral Stats
            let stats_key = DataKey::ReferralStats(referrer.clone());
            let mut stats = env
                .storage()
                .persistent()
                .get::<DataKey, ReferralStats>(&stats_key)
                .unwrap_or(ReferralStats {
                    total_referrals: 1,
                    earned_bonus: 0,
                });
            stats.earned_bonus += earned_score;

            env.storage().persistent().set(&stats_key, &stats);
            env.storage()
                .persistent()
                .extend_ttl(&stats_key, MIN_TTL_THRESHOLD, MIN_TTL_EXTEND_TO);

            env.events().publish(
                (symbol_short!("reput"), symbol_short!("ref_rwrd")),
                (referrer.clone(), earned_score),
            );
        }
    }

    /// Set configuration for the referral bonus
    pub fn set_referral_bonus(env: Env, admin: Address, bonus: u64) -> Result<(), ReputationError> {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)?;
        if admin != stored_admin {
            return Err(ReputationError::Unauthorized);
        }
        env.storage()
            .instance()
            .set(&DataKey::ReferralBonus, &bonus);
        bump_instance_ttl(&env);
        Ok(())
    }

    /// Get the reputation data for a user, applying time decay to totals.
    pub fn get_reputation(env: Env, user: Address) -> Result<UserReputation, ReputationError> {
        let rep_key = DataKey::Reputation(user.clone());
        if !env.storage().persistent().has(&rep_key) {
            return Err(ReputationError::UserNotFound);
        }

        let (total_score, total_weight, review_count) = Self::get_decayed_totals(&env, user.clone());
        
        bump_reputation_ttl(&env, &user);
        Ok(UserReputation {
            user,
            total_score,
            total_weight,
            review_count,
        })
    }

    /// Initialize the reputation contract with an admin.
    pub fn initialize(env: Env, admin: Address, decay_rate: u32) -> Result<(), ReputationError> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(ReputationError::Unauthorized); // already initialized
        }
        if decay_rate > 100 {
            return Err(ReputationError::InvalidDecayRate);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::DecayRate, &decay_rate);
        env.storage()
            .instance()
            .set(&DataKey::MinStake, &MIN_REVIEW_STAKE_DEFAULT);
        env.storage()
            .instance()
            .set(&DataKey::RateLimit, &RATE_LIMIT_LEDGERS_DEFAULT);
        env.storage().instance().set(&DataKey::Paused, &false);
        bump_instance_ttl(&env);
        Ok(())
    }

    /// Pause the contract (admin only).
    pub fn pause(env: Env, admin: Address) -> Result<(), ReputationError> {
        admin.require_auth();
        require_admin(&env, &admin)?;

        env.storage().instance().set(&DataKey::Paused, &true);
        bump_instance_ttl(&env);

        // Emit event
        env.events().publish(
            (symbol_short!("reput"), symbol_short!("paused")),
            (admin, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Unpause the contract (admin only).
    pub fn unpause(env: Env, admin: Address) -> Result<(), ReputationError> {
        admin.require_auth();
        require_admin(&env, &admin)?;

        env.storage().instance().set(&DataKey::Paused, &false);
        bump_instance_ttl(&env);

        // Emit event
        env.events().publish(
            (symbol_short!("reput"), symbol_short!("unpaused")),
            (admin, env.ledger().timestamp()),
        );

        Ok(())
    }

    /// Check if the contract is paused.
    pub fn is_paused(env: Env) -> bool {
        env.storage()
            .instance()
            .get(&DataKey::Paused)
            .unwrap_or(false)
    }

    /// Update the minimum stake requirement for reviews.
    pub fn set_min_stake(env: Env, admin: Address, amount: i128) -> Result<(), ReputationError> {
        admin.require_auth();
        require_not_paused(&env)?;
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)?;
        if admin != stored_admin {
            return Err(ReputationError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::MinStake, &amount);
        bump_instance_ttl(&env);
        Ok(())
    }

    /// Update the rate limit (number of ledgers between reviews).
    pub fn set_rate_limit(env: Env, admin: Address, ledgers: u32) -> Result<(), ReputationError> {
        admin.require_auth();
        require_not_paused(&env)?;
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)?;
        if admin != stored_admin {
            return Err(ReputationError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::RateLimit, &ledgers);
        bump_instance_ttl(&env);
        Ok(())
    }

    /// Get the current minimum stake requirement.
    pub fn get_min_stake(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::MinStake)
            .unwrap_or(MIN_REVIEW_STAKE_DEFAULT)
    }

    /// Get the current rate limit in ledgers.
    pub fn get_rate_limit(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::RateLimit)
            .unwrap_or(RATE_LIMIT_LEDGERS_DEFAULT)
    }

    /// Set the token used for accountability stake.
    pub fn set_token(env: Env, admin: Address, token: Address) -> Result<(), ReputationError> {
        admin.require_auth();
        require_not_paused(&env)?;
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)?;
        if admin != stored_admin {
            return Err(ReputationError::Unauthorized);
        }
        env.storage().instance().set(&DataKey::Token, &token);
        bump_instance_ttl(&env);
        Ok(())
    }

    /// Get the current accountability token address.
    pub fn get_token(env: Env) -> Result<Address, ReputationError> {
        env.storage()
            .instance()
            .get(&DataKey::Token)
            .ok_or(ReputationError::NotInitialized)
    }

    /// Set the decay rate for reviews (0-100 percentage per year).
    pub fn set_decay_rate(env: Env, admin: Address, rate: u32) -> Result<(), ReputationError> {
        admin.require_auth();
        require_not_paused(&env)?;

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)?;
        if admin != stored_admin {
            return Err(ReputationError::Unauthorized);
        }


        if rate > 100 {
            return Err(ReputationError::InvalidDecayRate);
        }


        env.storage().instance().set(&DataKey::DecayRate, &rate);
        bump_instance_ttl(&env);


        // Emit event
        env.events().publish(
            (symbol_short!("reput"), symbol_short!("decay_rt")),
            (admin, rate),
        );
        Ok(())
    }

    /// Calculate effective weight of a review, applying time decay.
    /// Formula: effective_weight = stake_weight * max(0, 100 - decay_rate * age_in_seconds / ONE_YEAR) / 100
    pub fn get_effective_weight(env: Env, review: Review, current_time: u64) -> i128 {
        let decay_rate: u32 = env
            .storage()
            .instance()
            .get(&DataKey::DecayRate)
            .unwrap_or(0);

        let initial_weight = if review.stake_weight > 0 {
            review.stake_weight
        } else {
            1_i128
        };


        if decay_rate == 0 {
            return initial_weight;
        }

        let age_in_seconds = current_time.saturating_sub(review.timestamp);
        let one_year_in_seconds = 31_536_000_u64;


        let decay_amount = (decay_rate as u64).saturating_mul(age_in_seconds) / one_year_in_seconds;
        let decay_factor = 100_u64.saturating_sub(decay_amount);


        if decay_factor == 0 {
            return 0;
        }


        (initial_weight.saturating_mul(decay_factor as i128)) / 100
    }

    /// Internal helper to calculate decayed totals (score, weight, count).
    fn get_decayed_totals(env: &Env, user: Address) -> (u64, u64, u32) {
        let reviews = Self::get_reviews(env.clone(), user.clone());
        let current_time = env.ledger().timestamp();
        let mut total_score: u64 = 0;
        let mut total_weight: u64 = 0;
        let review_count = reviews.len();

        for review in reviews.iter() {
            let effective_weight =
                Self::get_effective_weight(env.clone(), review.clone(), current_time);
            let weight = if effective_weight > 0 {
                effective_weight as u64
            } else {
                0
            };
            total_score += (review.rating as u64) * weight;
            total_weight += weight;
        }

        // Add decayed referral bonuses
        let bonuses_key = DataKey::ReferralBonusList(user);
        let bonuses: Vec<ReferralBonusRecord> = env
            .storage()
            .persistent()
            .get(&bonuses_key)
            .unwrap_or(Vec::new(env));

        let decay_rate: u32 = env
            .storage()
            .instance()
            .get(&DataKey::DecayRate)
            .unwrap_or(0);

        for bonus in bonuses.iter() {
            let weight = if decay_rate == 0 {
                bonus.weight
            } else {
                let age_in_seconds = current_time.saturating_sub(bonus.timestamp);
                let one_year_in_seconds = 31_536_000_u64;
                let decay_amount = (decay_rate as u64).saturating_mul(age_in_seconds) / one_year_in_seconds;
                let decay_factor = 100_u64.saturating_sub(decay_amount);
                
                if decay_factor == 0 {
                    0
                } else {
                    (bonus.weight.saturating_mul(decay_factor)) / 100
                }
            };

            if weight > 0 && bonus.weight > 0 {
                // amount is already rating * weight in process_referral_bonus
                // but wait, earned_score = bonus_rating * min_stake;
                // so if we decay the weight, we should decay the score too.
                // Score = bonus_rating * decayed_weight
                let bonus_rating = bonus.amount / bonus.weight;
                total_score += bonus_rating * weight;
                total_weight += weight;
            }
        }

        (total_score, total_weight, review_count)
    }

    pub fn get_average_rating(env: Env, user: Address) -> Result<u64, ReputationError> {
        let (total_score, total_weight, _) = Self::get_decayed_totals(&env, user);
        
        if total_weight == 0 {
            return Ok(0); // If completely decayed, acts as no rep
        }

        Ok((total_score * 100) / total_weight)
    }

    /// Get the total number of reviews for a user.
    pub fn get_review_count(env: Env, user: Address) -> u32 {
        let rep_key = DataKey::Reputation(user);
        let reputation: Option<UserReputation> = env.storage().persistent().get(&rep_key);
        match reputation {
            Some(rep) => {
                bump_reputation_ttl(&env, &rep.user);
                rep.review_count
            }
            None => 0,
        }
    }

    /// Get all reviews for a user.
    pub fn get_reviews(env: Env, user: Address) -> Vec<Review> {
        let reviews_key = DataKey::Reviews(user);
        let reviews: Option<Vec<Review>> = env.storage().persistent().get(&reviews_key);
        match reviews {
            Some(list) => {
                env.storage().persistent().extend_ttl(
                    &reviews_key,
                    MIN_TTL_THRESHOLD,
                    MIN_TTL_EXTEND_TO,
                );
                list
            }
            None => Vec::new(&env),
        }
    }

    /// Get the reputation tier for a user based on their average rating.
    pub fn get_tier(env: Env, user: Address) -> ReputationTier {
        match Self::get_average_rating(env, user) {
            Ok(avg_rating) => calculate_tier(avg_rating),
            Err(_) => ReputationTier::None,
        }
    }

    /// Get all badges awarded to a user.
    pub fn get_badges(env: Env, user: Address) -> Vec<Badge> {
        let badges_key = DataKey::Badges(user);
        let badges: Option<Vec<Badge>> = env.storage().persistent().get(&badges_key);
        match badges {
            Some(list) => {
                env.storage().persistent().extend_ttl(
                    &badges_key,
                    MIN_TTL_THRESHOLD,
                    MIN_TTL_EXTEND_TO,
                );
                list
            }
            None => Vec::new(&env),
        }
    }

    /// Slash the staked reputation score of a losing dispute party.
    /// Reduces total_score by `amount` (floored at 0) and emits a StakeSlashed event.
    /// Can only be called by the registered admin (dispute contract should be admin or
    /// a trusted caller — in practice the dispute contract invokes this cross-contract).
    pub fn slash_stake(
        env: Env,
        caller: Address,
        loser: Address,
        job_id: u64,
        amount: u64,
    ) -> Result<(), ReputationError> {
        caller.require_auth();
        require_not_paused(&env)?;

        // Only admin may slash stakes
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ReputationError::NotInitialized)?;
        if caller != stored_admin {
            return Err(ReputationError::NotAdmin);
        }

        let rep_key = DataKey::Reputation(loser.clone());
        let mut reputation: UserReputation = env
            .storage()
            .persistent()
            .get(&rep_key)
            .unwrap_or(UserReputation {
                user: loser.clone(),
                total_score: 0,
                total_weight: 0,
                review_count: 0,
            });

        // Reduce score, floor at 0
        reputation.total_score = reputation.total_score.saturating_sub(amount);

        env.storage().persistent().set(&rep_key, &reputation);
        bump_reputation_ttl(&env, &loser);

        // Emit StakeSlashed event
        env.events().publish(
            (symbol_short!("reput"), symbol_short!("slashed")),
            (loser, job_id, amount),
        );

        Ok(())
    }
}

#[cfg(test)]
mod test;
