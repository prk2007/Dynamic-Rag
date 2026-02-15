import express from 'express';
import { authenticate } from '../middleware/authenticate.js';
import {
  updateCustomerOpenAIKey,
  getCustomerOpenAIKey,
  findCustomerById
} from '../models/customer.js';

const router = express.Router();

/**
 * GET /api/profile
 * Get current user profile
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const customer = await findCustomerById(customerId);

    if (!customer) {
      return res.status(404).json({
        error: 'Customer not found',
      });
    }

    // Return safe profile data (no secrets)
    res.json({
      id: customer.id,
      email: customer.email,
      company_name: customer.company_name,
      avatar_url: customer.avatar_url,
      email_verified: customer.email_verified,
      status: customer.status,
      created_at: customer.created_at,
      has_openai_key: customer.openai_api_key !== null,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /api/profile/openai-key
 * Update OpenAI API key
 */
router.put('/openai-key', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const { openai_key } = req.body;

    // Validate OpenAI key format
    if (!openai_key || typeof openai_key !== 'string') {
      return res.status(400).json({
        error: 'Invalid OpenAI API key',
        message: 'OpenAI API key is required and must be a string',
      });
    }

    // Basic validation - OpenAI keys start with 'sk-'
    if (!openai_key.startsWith('sk-')) {
      return res.status(400).json({
        error: 'Invalid OpenAI API key format',
        message: 'OpenAI API key should start with "sk-"',
      });
    }

    // Update the key (will be encrypted in the function)
    await updateCustomerOpenAIKey(customerId, openai_key);

    console.log(`✅ OpenAI API key updated for customer ${customerId}`);

    res.json({
      message: 'OpenAI API key updated successfully',
      has_openai_key: true,
    });
  } catch (error) {
    console.error('Update OpenAI key error:', error);
    res.status(500).json({
      error: 'Failed to update OpenAI API key',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /api/profile/openai-key
 * Remove OpenAI API key
 */
router.delete('/openai-key', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;

    // Set to null to remove the key
    await updateCustomerOpenAIKey(customerId, '');

    console.log(`🗑️  OpenAI API key removed for customer ${customerId}`);

    res.json({
      message: 'OpenAI API key removed successfully',
      has_openai_key: false,
    });
  } catch (error) {
    console.error('Remove OpenAI key error:', error);
    res.status(500).json({
      error: 'Failed to remove OpenAI API key',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/profile/openai-key/status
 * Check if OpenAI key is configured (doesn't return the actual key)
 */
router.get('/openai-key/status', authenticate, async (req, res) => {
  try {
    const customerId = req.user!.id;
    const key = await getCustomerOpenAIKey(customerId);

    res.json({
      has_openai_key: key !== null && key !== '',
      key_preview: key ? `${key.substring(0, 7)}...${key.substring(key.length - 4)}` : null,
    });
  } catch (error) {
    console.error('Get OpenAI key status error:', error);
    res.status(500).json({
      error: 'Failed to get OpenAI key status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
