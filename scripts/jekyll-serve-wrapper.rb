#!/usr/bin/env ruby
# Wrapper script to run Jekyll with SSL verification disabled
# This fixes certificate verification issues with remote themes

require 'openssl'
require 'net/http'

# Disable SSL certificate verification globally
# This is necessary because Ruby 3.4.1 has stricter SSL checks including CRL verification
OpenSSL::SSL::VERIFY_PEER = OpenSSL::SSL::VERIFY_NONE

# Monkey patch Net::HTTP to force SSL verification off
module Net
  class HTTP
    alias_method :original_use_ssl=, :use_ssl=

    def use_ssl=(flag)
      self.original_use_ssl = flag
      if flag
        self.verify_mode = OpenSSL::SSL::VERIFY_NONE
      end
    end
  end
end

# Now load and run Jekyll
require 'bundler/setup'
Bundler.require

# Set up Jekyll command line args (without --open-url to avoid issues)
ARGV.replace(['serve', '--livereload', '--host=0.0.0.0'])

# Load and run Jekyll
load Gem.bin_path('jekyll', 'jekyll')
