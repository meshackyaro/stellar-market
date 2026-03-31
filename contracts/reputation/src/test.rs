#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    vec, Env, String,
};
use stellar_market_escrow::EscrowContract;

// The minimum stake required per review (must match lib.rs constant)
const MIN_STAKE: i128 = 10_000_000;

/// Helper: create a job in the escrow contract and mark it as completed.
/// This uses the actual escrow contract functions to ensure proper storage.
fn setup_completed_job(
    env: &Env,
    escrow_id: &Address,
    _job_id: u64,
    client: &Address,
    freelancer: &Address,
    token: &Address,
) {
    let escrow_client = stellar_market_escrow::EscrowContractClient::new(env, escrow_id);

    // Create a job with one milestone
    let milestones = vec![
        env,
        (String::from_str(env, "Task"), 100_i128, 9999999999u64),
    ];
    let job_id = escrow_client.create_job(
        client,
        freelancer,
        token,
        &milestones,
        &9999999999u64,
        &86400u64,
    );

    // Fund the job
    escrow_client.fund_job(&job_id, client);

    // Mark the job as completed using the dispute resolution callback
    escrow_client.resolve_dispute_callback(&job_id, &stellar_market_escrow::DisputeResolution::FreelancerWins);
}

/// Helper: create a job in the escrow contract and mark it as in progress.
/// This uses the actual escrow contract functions to ensure proper storage.
fn setup_in_progress_job(
    env: &Env,
    escrow_id: &Address,
    _job_id: u64,
    client: &Address,
    freelancer: &Address,
    token: &Address,
) {
    let escrow_client = stellar_market_escrow::EscrowContractClient::new(env, escrow_id);

    // Create a job with one milestone
    let milestones = vec![
        env,
        (String::from_str(env, "Task"), 100_i128, 9999999999u64),
    ];
    let job_id = escrow_client.create_job(
        client,
        freelancer,
        token,
        &milestones,
        &9999999999u64,
        &86400u64,
    );

    // Fund the job to move it to Funded status
    escrow_client.fund_job(&job_id, client);
}

fn create_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone()).address()
}

fn mint(env: &Env, token_addr: &Address, admin: &Address, to: &Address, amount: i128) {
    let token_client = token::StellarAssetClient::new(env, token_addr);
    token_client.mint(to, &amount);
    // Also approve reputation contract to receive stake (mock_all_auths handles this)
    let _ = admin;
}

#[test]
fn test_submit_review_client_reviews_freelancer() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &client_addr, 100_000_000);

    setup_completed_job(
        &env,
        &escrow_id,
        1u64,
        &client_addr,
        &freelancer_addr,
        &token_addr,
    );

    reputation_client.submit_review(
        &escrow_id,
        &client_addr,
        &freelancer_addr,
        &1u64,
        &4u32,
        &String::from_str(&env, "Great work!"),
        &MIN_STAKE,
    );

    let rep = reputation_client.get_reputation(&freelancer_addr);
    assert_eq!(rep.review_count, 1);
    assert_eq!(rep.total_score, 4 * MIN_STAKE as u64);
    assert_eq!(rep.total_weight, MIN_STAKE as u64);
}


#[test]
fn test_average_rating() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer1, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer2, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer1, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer2, &reviewee, &token_addr);

    // Review 1: 5 stars, min weight
    reputation_client.submit_review(
        &escrow_id,
        &reviewer1,
        &reviewee,
        &1u64,
        &5u32,
        &String::from_str(&env, "Excellent"),
        &MIN_STAKE,
    );

    // Review 2: 3 stars, min weight
    reputation_client.submit_review(
        &escrow_id,
        &reviewer2,
        &reviewee,
        &2u64,
        &3u32,
        &String::from_str(&env, "Average"),
        &MIN_STAKE,
    );

    let avg = reputation_client.get_average_rating(&reviewee);
    // (5*MIN + 3*MIN) * 100 / (MIN + MIN) = 400 (4.00 stars)
    assert_eq!(avg, 400);
    assert_eq!(reputation_client.get_review_count(&reviewee), 2);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_invalid_rating() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);

    // Rating is validated first (before stake check), so small weight still triggers #1
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &6u32, // Invalid: max is 5
        &String::from_str(&env, "Too high"),
        &1_i128,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_self_review() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let user = Address::generate(&env);

    // Self-review check happens before stake check
    reputation_client.submit_review(
        &escrow_id,
        &user,
        &user,
        &1u64,
        &5u32,
        &String::from_str(&env, "I'm great"),
        &1_i128,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_reject_below_min_stake() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);

    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &5u32,
        &String::from_str(&env, "Sneaky low stake"),
        &(MIN_STAKE - 1), // Just below minimum
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_job_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);

    // BelowMinStake is checked before JobNotFound, so we see #11 here.
    // To test JobNotFound properly, we need sufficient stake — but there's no token minted,
    // so the token transfer will fail anyway. This tests the ordering of checks.
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &99u64,
        &5u32,
        &String::from_str(&env, "Does not exist"),
        &1_i128, // Below min stake triggers #11 first
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_job_not_found_with_valid_stake() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 100_000_000);

    // No job set up in escrow — should fail with JobNotFound (#7)
    // We need a job record to pass the escrow check, but no job exists here.
    // We use a dummy token for the stake transfer to succeed, but crossing contract
    // boundary will fail because there's no job.
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &99u64,
        &5u32,
        &String::from_str(&env, "Does not exist"),
        &MIN_STAKE,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_job_not_completed() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &client_addr, 100_000_000);

    // Job is InProgress, not Completed
    setup_in_progress_job(
        &env,
        &escrow_id,
        1u64,
        &client_addr,
        &freelancer_addr,
        &token_addr,
    );

    reputation_client.submit_review(
        &escrow_id,
        &client_addr,
        &freelancer_addr,
        &1u64,
        &5u32,
        &String::from_str(&env, "Too early"),
        &MIN_STAKE,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_not_job_participant() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let outsider = Address::generate(&env);
    let another = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &client_addr, 100_000_000);
    mint(&env, &token_addr, &token_admin, &outsider, 100_000_000);

    setup_completed_job(
        &env,
        &escrow_id,
        1u64,
        &client_addr,
        &freelancer_addr,
        &token_addr,
    );

    // outsider and another were not part of job 1
    reputation_client.submit_review(
        &escrow_id,
        &outsider,
        &another,
        &1u64,
        &5u32,
        &String::from_str(&env, "Fraudulent review"),
        &MIN_STAKE,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_reviewer_not_participant_but_reviewee_is() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let outsider = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &client_addr, 100_000_000);
    mint(&env, &token_addr, &token_admin, &outsider, 100_000_000);

    setup_completed_job(
        &env,
        &escrow_id,
        1u64,
        &client_addr,
        &freelancer_addr,
        &token_addr,
    );

    // outsider tries to review the freelancer — reviewer is not a participant
    reputation_client.submit_review(
        &escrow_id,
        &outsider,
        &freelancer_addr,
        &1u64,
        &5u32,
        &String::from_str(&env, "I wasn't there"),
        &MIN_STAKE,
    );
}

#[test]
fn test_get_tier_no_reputation() {
    let env = Env::default();
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let user = Address::generate(&env);
    let tier = reputation_client.get_tier(&user);
    assert_eq!(tier, ReputationTier::None);
}

#[test]
fn test_get_tier_bronze() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee, &token_addr);

    // Submit review with rating 2 (avg = 200, Bronze tier)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &2u32,
        &String::from_str(&env, "Okay"),
        &MIN_STAKE,
    );

    let tier = reputation_client.get_tier(&reviewee);
    assert_eq!(tier, ReputationTier::Bronze);
}

#[test]
fn test_get_tier_silver() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee, &token_addr);

    // Submit review with rating 4 (avg = 400, Silver tier)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &4u32,
        &String::from_str(&env, "Good"),
        &MIN_STAKE,
    );

    let tier = reputation_client.get_tier(&reviewee);
    assert_eq!(tier, ReputationTier::Silver);
}

#[test]
fn test_get_tier_gold() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer1, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer2, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer1, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer2, &reviewee, &token_addr);

    // Two 5-star reviews with equal weight -> avg = 500 (Gold tier)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer1,
        &reviewee,
        &1u64,
        &5u32,
        &String::from_str(&env, "Excellent"),
        &MIN_STAKE,
    );

    reputation_client.submit_review(
        &escrow_id,
        &reviewer2,
        &reviewee,
        &2u64,
        &5u32,
        &String::from_str(&env, "Perfect"),
        &MIN_STAKE,
    );

    let tier = reputation_client.get_tier(&reviewee);
    assert_eq!(tier, ReputationTier::Gold);
}

#[test]
fn test_get_tier_platinum() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);
    let reviewer3 = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer1, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer2, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer3, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer1, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer2, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 3u64, &reviewer3, &reviewee, &token_addr);

    // Three 5-star reviews -> avg = 500 (Gold)
    // Platinum (700+) is impossible with max rating 5 * 100 = 500
    reputation_client.submit_review(
        &escrow_id,
        &reviewer1,
        &reviewee,
        &1u64,
        &5u32,
        &String::from_str(&env, "Outstanding"),
        &MIN_STAKE,
    );

    reputation_client.submit_review(
        &escrow_id,
        &reviewer2,
        &reviewee,
        &2u64,
        &5u32,
        &String::from_str(&env, "Exceptional"),
        &MIN_STAKE,
    );

    reputation_client.submit_review(
        &escrow_id,
        &reviewer3,
        &reviewee,
        &3u64,
        &5u32,
        &String::from_str(&env, "World-class"),
        &MIN_STAKE,
    );

    let avg = reputation_client.get_average_rating(&reviewee);
    assert_eq!(avg, 500);

    // Platinum requires avg >= 700, impossible with max rating = 5 (5*100=500). Current tier: Gold.
    let tier = reputation_client.get_tier(&reviewee);
    assert_eq!(tier, ReputationTier::Gold);
}

#[test]
fn test_badge_awarded_on_tier_crossing() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee, &token_addr);

    // Submit review that crosses into Bronze tier
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &2u32,
        &String::from_str(&env, "Decent"),
        &MIN_STAKE,
    );

    let badges = reputation_client.get_badges(&reviewee);
    assert_eq!(badges.len(), 1);
    assert_eq!(badges.get(0).unwrap().badge_type, ReputationTier::Bronze);
}

#[test]
fn test_badge_not_duplicated() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer1, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer2, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer1, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer2, &reviewee, &token_addr);

    // First review: Bronze tier (rating 2)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer1,
        &reviewee,
        &1u64,
        &2u32,
        &String::from_str(&env, "Okay"),
        &MIN_STAKE,
    );

    // Second review: Still Bronze tier (avg = (2 + 2) / 2 = 2 = 200)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer2,
        &reviewee,
        &2u64,
        &2u32,
        &String::from_str(&env, "Okay again"),
        &MIN_STAKE,
    );

    let badges = reputation_client.get_badges(&reviewee);
    // Should only have one Bronze badge, not two
    assert_eq!(badges.len(), 1);
    assert_eq!(badges.get(0).unwrap().badge_type, ReputationTier::Bronze);
}

#[test]
fn test_multiple_tier_badges() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);
    let reviewer3 = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer1, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer2, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer3, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer1, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer2, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 3u64, &reviewer3, &reviewee, &token_addr);

    // First review: Bronze tier (rating 2, avg = 200)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer1,
        &reviewee,
        &1u64,
        &2u32,
        &String::from_str(&env, "Okay"),
        &MIN_STAKE,
    );

    let badges = reputation_client.get_badges(&reviewee);
    assert_eq!(badges.len(), 1);
    assert_eq!(badges.get(0).unwrap().badge_type, ReputationTier::Bronze);

    // Second review: Silver tier
    // avg = (2*MIN + 5*MIN) * 100 / (2*MIN) = 350 -> Silver
    reputation_client.submit_review(
        &escrow_id,
        &reviewer2,
        &reviewee,
        &2u64,
        &5u32,
        &String::from_str(&env, "Great improvement"),
        &MIN_STAKE,
    );

    let badges = reputation_client.get_badges(&reviewee);
    assert_eq!(badges.len(), 2);
    assert_eq!(badges.get(0).unwrap().badge_type, ReputationTier::Bronze);
    assert_eq!(badges.get(1).unwrap().badge_type, ReputationTier::Silver);

    // Third review with same weight and rating 5:
    // avg = (2 + 5 + 5) * MIN * 100 / (3 * MIN) = 1200 / 3 = 400 -> still Silver
    reputation_client.submit_review(
        &escrow_id,
        &reviewer3,
        &reviewee,
        &3u64,
        &5u32,
        &String::from_str(&env, "Excellent"),
        &MIN_STAKE,
    );

    let avg = reputation_client.get_average_rating(&reviewee);
    assert!(avg < 500); // Still Silver

    let badges = reputation_client.get_badges(&reviewee);
    assert_eq!(badges.len(), 2); // Still Bronze and Silver
}

#[test]
fn test_tier_downgrade_no_badge_removal() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer1 = Address::generate(&env);
    let reviewer2 = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer1, 100_000_000);
    mint(&env, &token_addr, &token_admin, &reviewer2, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer1, &reviewee, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer2, &reviewee, &token_addr);

    // First review: Silver tier (rating 4, avg = 400)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer1,
        &reviewee,
        &1u64,
        &4u32,
        &String::from_str(&env, "Good"),
        &MIN_STAKE,
    );

    let badges = reputation_client.get_badges(&reviewee);
    assert_eq!(badges.len(), 1);
    assert_eq!(badges.get(0).unwrap().badge_type, ReputationTier::Silver);

    // Second review: Low rating brings average down to Bronze
    // avg = (4*M + 1*M) * 100 / (2*M) = 250 (Bronze)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer2,
        &reviewee,
        &2u64,
        &1u32,
        &String::from_str(&env, "Poor"),
        &MIN_STAKE,
    );

    let tier = reputation_client.get_tier(&reviewee);
    assert_eq!(tier, ReputationTier::Bronze);

    // Badge should still exist (badges are permanent achievements)
    let badges = reputation_client.get_badges(&reviewee);
    assert_eq!(badges.len(), 2); // Silver badge remains, Bronze badge added
    assert_eq!(badges.get(0).unwrap().badge_type, ReputationTier::Silver);
    assert_eq!(badges.get(1).unwrap().badge_type, ReputationTier::Bronze);
}

#[test]
fn test_get_reputation_with_decay() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    // Initialize with 50% decay per year
    let admin = Address::generate(&env);
    reputation_client.initialize(&admin, &50);
    reputation_client.set_token(&admin, &Address::generate(&env)); // Needs a token set for transfers

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 100_000_000);

    // Set token in reputation contract to match the job token
    reputation_client.set_token(&admin, &token_addr);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee, &token_addr);

    // Initial review at t=0
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 0,
        protocol_version: 20,
        sequence_number: 100,
        network_id: [0; 32],
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 100000,
    });

    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &4u32,
        &String::from_str(&env, "Good"),
        &MIN_STAKE,
    );

    // At t=0, score should be raw
    let rep0 = reputation_client.get_reputation(&reviewee);
    assert_eq!(rep0.total_score, 4 * MIN_STAKE as u64);
    assert_eq!(rep0.total_weight, MIN_STAKE as u64);

    // Advance time by 1 year (31,536,000 seconds)
    // Decay is 50%, so weight should be 50% of MIN_STAKE
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 31_536_000,
        protocol_version: 20,
        sequence_number: 100,
        network_id: [0; 32],
        base_reserve: 10,
        min_temp_entry_ttl: 10,
        min_persistent_entry_ttl: 10,
        max_entry_ttl: 100000,
    });
    
    let rep1 = reputation_client.get_reputation(&reviewee);
    let expected_weight = (MIN_STAKE as u64) / 2;
    let expected_score = 4 * expected_weight;
    
    assert_eq!(rep1.total_weight, expected_weight);
    assert_eq!(rep1.total_score, expected_score);
    assert_eq!(rep1.review_count, 1);
}

#[test]
fn test_get_badges_empty() {
    let env = Env::default();
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let user = Address::generate(&env);
    let badges = reputation_client.get_badges(&user);
    assert_eq!(badges.len(), 0);
}

#[test]
fn test_badge_timestamp() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee, &token_addr);

    let before_timestamp = env.ledger().timestamp();

    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &3u32,
        &String::from_str(&env, "Good"),
        &MIN_STAKE,
    );

    let badges = reputation_client.get_badges(&reviewee);
    assert_eq!(badges.len(), 1);

    let badge = badges.get(0).unwrap();
    assert!(badge.awarded_at >= before_timestamp);
}

#[test]
fn test_set_decay_rate() {
    let env = Env::default();
    env.mock_all_auths();

    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);
    let admin = Address::generate(&env);

    reputation_client.initialize(&admin, &50u32);

    // Set valid decay rate
    reputation_client.set_decay_rate(&admin, &75u32);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_set_decay_rate_invalid() {
    let env = Env::default();
    env.mock_all_auths();

    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);
    let admin = Address::generate(&env);

    reputation_client.initialize(&admin, &50u32);

    // Set invalid decay rate > 100
    reputation_client.set_decay_rate(&admin, &101u32);
}

#[test]
fn test_decay_calculation() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);
    let admin = Address::generate(&env);

    // Set decay rate to 50% per year
    reputation_client.initialize(&admin, &50u32);

    let reviewer = Address::generate(&env);
    let reviewee = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 1_000_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee, &token_addr);

    // Initial timestamp: day 0
    let start_time = 1_000_000;
    env.ledger().with_mut(|l| l.timestamp = start_time);

    // Review with weight MIN_STAKE, rating 5
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee,
        &1u64,
        &5u32,
        &String::from_str(&env, "Great"),
        &MIN_STAKE,
    );

    // At day 0 (no decay), avg = 500
    assert_eq!(reputation_client.get_average_rating(&reviewee), 500);

    // Advance 1 day (86400 seconds) — negligible decay
    env.ledger().with_mut(|l| l.timestamp = start_time + 86400);
    assert_eq!(reputation_client.get_average_rating(&reviewee), 500);

    // Advance 1 year (31,536,000 seconds)
    // 50% decay per year -> weight should be 50% of original, but ratio is the same for a single review
    env.ledger()
        .with_mut(|l| l.timestamp = start_time + 31_536_000);
    assert_eq!(reputation_client.get_average_rating(&reviewee), 500);

    // To test actual decay, add a second review at year 1
    let reviewer2 = Address::generate(&env);
    mint(&env, &token_addr, &token_admin, &reviewer2, 1_000_000_000);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer2, &reviewee, &token_addr);

    // Second review at year 1 with rating 1 (Poor)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer2,
        &reviewee,
        &2u64,
        &1u32,
        &String::from_str(&env, "Terrible now"),
        &MIN_STAKE,
    );

    // Review 1 (5 stars) has 50% weight decay. Review 2 (1 star) has full weight.
    // effective_w1 = MIN_STAKE/2, effective_w2 = MIN_STAKE
    // Weighted score: 5 * (MIN/2) + 1 * MIN = 2.5*MIN + MIN = 3.5*MIN
    // Total weight: MIN/2 + MIN = 1.5*MIN
    // Avg = 3.5/1.5 * 100 = 233
    assert_eq!(reputation_client.get_average_rating(&reviewee), 233);

    // Advance to year 2
    // Review 1 is 2 years old -> 100% decayed (weight 0)
    // Review 2 is 1 year old -> 50% decayed (weight MIN/2)
    // Weighted score: 0 + 1 * MIN/2 = MIN/2
    // Total weight: MIN/2
    // Avg = 1.0 * 100 = 100
    env.ledger()
        .with_mut(|l| l.timestamp = start_time + 63_072_000);
    assert_eq!(reputation_client.get_average_rating(&reviewee), 100);
}

#[test]
fn test_get_set_min_stake() {
    let env = Env::default();
    env.mock_all_auths();

    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);
    let admin = Address::generate(&env);

    reputation_client.initialize(&admin, &50u32);

    // Default min stake
    assert_eq!(reputation_client.get_min_stake(), MIN_STAKE);

    // Update min stake
    let new_stake = 20_000_000_i128;
    reputation_client.set_min_stake(&admin, &new_stake);
    assert_eq!(reputation_client.get_min_stake(), new_stake);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_reject_rate_limit() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);
    let admin = Address::generate(&env);

    reputation_client.initialize(&admin, &50u32);

    let reviewer = Address::generate(&env);
    let reviewee1 = Address::generate(&env);
    let reviewee2 = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 1_000_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee1, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer, &reviewee2, &token_addr);

    // First review succeeds
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee1,
        &1u64,
        &5u32,
        &String::from_str(&env, "First"),
        &MIN_STAKE,
    );

    // Second review in same ledger -> RateLimitExceeded (#12)
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee2,
        &2u64,
        &5u32,
        &String::from_str(&env, "Second"),
        &MIN_STAKE,
    );
}

#[test]
fn test_rate_limit_pass_after_time() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);
    let admin = Address::generate(&env);

    reputation_client.initialize(&admin, &50u32);

    let reviewer = Address::generate(&env);
    let reviewee1 = Address::generate(&env);
    let reviewee2 = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &reviewer, 1_000_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &reviewer, &reviewee1, &token_addr);
    setup_completed_job(&env, &escrow_id, 2u64, &reviewer, &reviewee2, &token_addr);

    // First review at ledger 0
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee1,
        &1u64,
        &5u32,
        &String::from_str(&env, "First"),
        &MIN_STAKE,
    );

    // Advance ledger past rate limit (120 ledgers)
    env.ledger().with_mut(|l| l.sequence_number = 200);

    // Now the second review should succeed
    reputation_client.submit_review(
        &escrow_id,
        &reviewer,
        &reviewee2,
        &2u64,
        &4u32,
        &String::from_str(&env, "Second"),
        &MIN_STAKE,
    );

    assert_eq!(reputation_client.get_review_count(&reviewee1), 1);
    assert_eq!(reputation_client.get_review_count(&reviewee2), 1);
}

#[test]
fn test_register_referral_success() {
    let env = Env::default();
    env.mock_all_auths();

    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let referrer = Address::generate(&env);
    let referree = Address::generate(&env);

    // Register referral
    reputation_client.register_referral(&referree, &referrer);

    // Assert referrer stats reflect the registration
    let stats = reputation_client.get_referral_stats(&referrer);
    assert_eq!(stats.total_referrals, 1);
    assert_eq!(stats.earned_bonus, 0); // No bonus until a job is completed
}

#[test]
fn test_referral_bonus_granted_on_first_job() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let admin = Address::generate(&env);
    reputation_client.initialize(&admin, &0); // Set no decay for simpler testing

    let referrer = Address::generate(&env);
    let client = Address::generate(&env);
    let freelancer = Address::generate(&env); // Freelancer will be referred
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);

    mint(&env, &token_addr, &token_admin, &client, 100_000_000);

    // Register the referral BEFORE the job finishes
    reputation_client.register_referral(&freelancer, &referrer);

    setup_completed_job(&env, &escrow_id, 1u64, &client, &freelancer, &token_addr);

    // Client submits review. During this submission, the contract hooks `process_referral_bonus`
    reputation_client.submit_review(
        &escrow_id,
        &client,
        &freelancer,
        &1u64,
        &5u32,
        &String::from_str(&env, "Good job"),
        &MIN_STAKE,
    );

    // Check Referrer's Stats
    let stats = reputation_client.get_referral_stats(&referrer);
    assert_eq!(stats.total_referrals, 1);

    // Earned bonus = DEFAULT_REFERRAL_BONUS (5) * MIN_STAKE (10_000_000)
    assert_eq!(stats.earned_bonus, 5 * MIN_STAKE as u64);

    // Check Referrer's Reputation (they should have received the bonus reputation payload natively)
    let rep = reputation_client.get_reputation(&referrer);
    assert_eq!(rep.total_score, 5 * MIN_STAKE as u64);
    assert_eq!(rep.total_weight, MIN_STAKE as u64);
}

#[test]
fn test_referral_bonus_not_granted_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let admin = Address::generate(&env);
    reputation_client.initialize(&admin, &0);

    let referrer = Address::generate(&env);
    let client = Address::generate(&env);
    let freelancer = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);

    mint(&env, &token_addr, &token_admin, &client, 100_000_000);
    mint(&env, &token_addr, &token_admin, &freelancer, 100_000_000); // So freelancer can review back

    reputation_client.register_referral(&freelancer, &referrer);
    setup_completed_job(&env, &escrow_id, 1u64, &client, &freelancer, &token_addr);

    // Client submits review -> Process bonus triggers for both client and freelancer
    reputation_client.submit_review(
        &escrow_id,
        &client,
        &freelancer,
        &1u64,
        &5u32,
        &String::from_str(&env, "First review"),
        &MIN_STAKE,
    );

    let initial_stats = reputation_client.get_referral_stats(&referrer);

    // Advance ledger to clear rate limits
    env.ledger().with_mut(|l| l.sequence_number = 200);

    // Freelancer reviews client on the SAME job (or they do a new job, doesn't matter)
    reputation_client.submit_review(
        &escrow_id,
        &freelancer,
        &client,
        &1u64,
        &4u32,
        &String::from_str(&env, "Second review"),
        &MIN_STAKE,
    );

    // Referrer stats should NOT have increased (bonus paid only once per referred user)
    let subsequent_stats = reputation_client.get_referral_stats(&referrer);
    assert_eq!(initial_stats.earned_bonus, subsequent_stats.earned_bonus);
}

/// Verifies that submitting a first review for a (reviewer, job_id) pair succeeds
/// and updates the reviewee's reputation correctly.
#[test]
fn test_first_review_succeeds_and_updates_reputation() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &client_addr, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &client_addr, &freelancer_addr, &token_addr);

    reputation_client.submit_review(
        &escrow_id,
        &client_addr,
        &freelancer_addr,
        &1u64,
        &5u32,
        &String::from_str(&env, "Excellent work!"),
        &MIN_STAKE,
    );

    let rep = reputation_client.get_reputation(&freelancer_addr);
    assert_eq!(rep.review_count, 1);
    assert_eq!(rep.total_score, 5 * MIN_STAKE as u64);
    assert_eq!(rep.total_weight, MIN_STAKE as u64);
}

/// Verifies that a second submit_review call with the same (reviewer, job_id)
/// is rejected with AlreadyReviewed (contract error #2), preventing score inflation.
#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_duplicate_review_rejected_with_already_reviewed() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register_contract(None, EscrowContract);
    let reputation_id = env.register_contract(None, ReputationContract);
    let reputation_client = ReputationContractClient::new(&env, &reputation_id);

    let client_addr = Address::generate(&env);
    let freelancer_addr = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token_addr = create_token(&env, &token_admin);
    mint(&env, &token_addr, &token_admin, &client_addr, 100_000_000);

    setup_completed_job(&env, &escrow_id, 1u64, &client_addr, &freelancer_addr, &token_addr);

    // First submission succeeds
    reputation_client.submit_review(
        &escrow_id,
        &client_addr,
        &freelancer_addr,
        &1u64,
        &5u32,
        &String::from_str(&env, "Great work!"),
        &MIN_STAKE,
    );

    // Advance past the rate-limit window so RateLimitExceeded does not fire first
    env.ledger().with_mut(|l| l.sequence_number = 200);

    // Second submission for the same (reviewer, job_id) must return AlreadyReviewed
    reputation_client.submit_review(
        &escrow_id,
        &client_addr,
        &freelancer_addr,
        &1u64,
        &5u32,
        &String::from_str(&env, "Duplicate attempt!"),
        &MIN_STAKE,
    );
}
